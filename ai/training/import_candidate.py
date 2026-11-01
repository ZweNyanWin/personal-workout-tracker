"""Fuse a completed local adapter and prepare a separately named Ollama candidate.

Never overwrites a model name or publishes weights. All paths derive from $HOME.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.request
import shutil

ROOT=Path(__file__).resolve().parents[2]
STATE=ROOT/'ai/training/local-state.json'


def api(path,body):
    request=urllib.request.Request('http://127.0.0.1:11434'+path,
        data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=30) as response:
        return json.load(response)


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser()
    parser.add_argument('--name',default='workout-coach-v1')
    parser.add_argument('--run',type=Path)
    parser.add_argument('--step',type=int)
    parser.add_argument('--system',type=Path,help='Serving system file; defaults to system.txt')
    parser.add_argument('--full-base',action='store_true',help='Fuse onto original full-precision weights before Ollama quantization')
    args=parser.parse_args()
    if not args.name.startswith('workout-coach-v') or not args.name.removeprefix('workout-coach-v').isdigit():
        raise ValueError('Use a separately versioned coach name')
    with urllib.request.urlopen('http://127.0.0.1:11434/api/tags',timeout=10) as response:
        names={m['name'] for m in json.load(response)['models']}
    if args.name+':latest' in names: raise RuntimeError('Candidate name already exists; use the next version')
    home=Path.home()/'workout-ai/powerbuild-v1'
    run=args.run or Path((home/'latest-run.txt').read_text().strip())
    config=json.loads((run/'config.json').read_text())
    adapters=Path(config['adapter_path'])
    if not (adapters/'adapters.safetensors').is_file(): raise FileNotFoundError('Completed adapter missing')
    selected_step=args.step or config['iters']
    if args.step:
        checkpoint=adapters/f'{args.step:07}_adapters.safetensors'
        if not checkpoint.is_file(): raise FileNotFoundError('Selected checkpoint missing')
        suffix='-fp16' if args.full_base else ''
        selected=run/f'selected-{args.step}{suffix}'
        selected.mkdir(exist_ok=False)
        shutil.copyfile(adapters/'adapter_config.json',selected/'adapter_config.json')
        shutil.copyfile(checkpoint,selected/'adapters.safetensors')
        adapters=selected
    state=json.loads(STATE.read_text())
    if state.get('busy'): raise RuntimeError('Training is still active; import after completion')
    fused=run/('fused-full-base' if args.full_base else 'fused-safetensors')
    if fused.exists(): raise RuntimeError('Fused output exists; inspect it rather than overwriting')
    state.update(busy=True,pid=os.getpid(),stage='Fusing candidate',note='Saving trained weights and importing a separate local Ollama model.')
    def update(**fields):
        state.update(fields,updatedAt=datetime.now(timezone.utc).isoformat())
        temp=STATE.with_suffix('.json.tmp');temp.write_text(json.dumps(state,indent=2));temp.replace(STATE)
    update()
    try:
        # Keep conversion's allocation cache small on a 16GB unified-memory Mac.
        import mlx.core as mx
        mx.set_cache_limit(512*1024**2)
        mx.set_memory_limit(10*1024**3)
        from mlx_lm.fuse import main as fuse
        source=(home/'base-path.txt').read_text().strip() if args.full_base else config['model']
        sys.argv=['mlx_lm.fuse','--model',source,'--adapter-path',str(adapters),
                  '--save-path',str(fused),'--dequantize']
        fuse()
        print('FUSED_READY',fused,flush=True)
        # The subprocess importer should not compete with this process for GPU
        # memory. Fusing is isolated below when invoked through this helper.
        update(stage='Fused weights saved',busy=False,
               note='Trained Safetensors saved. Import into Ollama is the next step.')
        system_path=(args.system or ROOT/'ai/training/system.txt').resolve()
        system=system_path.read_text().strip()
        modelfile=run/('Candidate-full-base.Modelfile' if args.full_base else 'Candidate.Modelfile')
        modelfile.write_text(f'FROM {fused}\nPARAMETER temperature 0.2\nPARAMETER num_ctx 8192\nPARAMETER num_predict 4096\nSYSTEM """{system}"""\n')
        manifest={'candidate':args.name,'base':json.loads((home/'base-provenance.json').read_text()),
                  'training_config':config,'selected_step':selected_step,'export_base':source,'full_precision_base':args.full_base,'dataset':json.loads((run/'dataset-manifest.json').read_text()),
                  'adapter_sha256':hashlib.sha256((adapters/'adapters.safetensors').read_bytes()).hexdigest(),
                  'system_sha256':hashlib.sha256(system.encode()).hexdigest(),'system_path':str(system_path),'modelfile':str(modelfile),
                  'published':False,'quality_status':'candidate; behavioral evaluation required'}
        (run/('candidate-manifest-full-base.json' if args.full_base else 'candidate-manifest.json')).write_text(json.dumps(manifest,indent=2))
        print('IMPORT_COMMAND',f'ollama create {args.name} -f {modelfile} --quantize int4',flush=True)
    except BaseException as error:
        update(busy=False,stage='Import preparation failed',note=f'{type(error).__name__}: {error}. Existing models and checkpoints remain available.')
        raise


if __name__=='__main__':
    main()
