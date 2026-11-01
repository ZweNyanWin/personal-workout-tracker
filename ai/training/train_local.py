"""Local-only QLoRA runner with recoverable checkpoints and browser status.

Usage: python ai/training/train_local.py --data ai/data/private/round-1
Preserves all existing model/output versions; never publishes any model.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import json
import math
import os
import re
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / 'ai/training/local-state.json'
HOME_ROOT = Path.home() / 'workout-ai/powerbuild-v1'
state = {'busy': True, 'stage': 'Preparing', 'step': 0, 'total': 120,
         'pid': os.getpid(), 'note': 'Creating a separate candidate; the original coach is preserved.'}


def update(**fields):
    state.update(fields)
    state['updatedAt'] = datetime.now(timezone.utc).isoformat()
    temp = STATE.with_suffix('.json.tmp')
    temp.write_text(json.dumps(state, indent=2))
    temp.replace(STATE)


def run(command, log, stage):
    update(stage=stage)
    print('STAGE:', stage, flush=True)
    with log.open('x') as handle:
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, bufsize=1, env={**os.environ, 'HF_HUB_OFFLINE': '1',
                                                       'HF_HUB_DISABLE_IMPLICIT_TOKEN': '1', 'PYTHONUNBUFFERED': '1'}) as process:
            try:
                for line in process.stdout:
                    handle.write(line);handle.flush()
                    print(line, end='', flush=True)
                    step=re.search(r'Iter (\d+): Train loss ([\d.]+)',line)
                    validation=re.search(r'Iter (\d+): Val loss ([\d.]+)',line)
                    if step: update(step=int(step[1]),loss=float(step[2]))
                    if validation: update(validationLoss=float(validation[2]))
                if process.wait(): raise RuntimeError(f'{stage} failed; inspect {log.name}')
            except BaseException:
                process.terminate()
                try: process.wait(timeout=15)
                except subprocess.TimeoutExpired: process.kill();process.wait()
                raise


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser()
    parser.add_argument('--data',type=Path,required=True)
    parser.add_argument('--iters',type=int,default=120)
    parser.add_argument('--max-seq-length',type=int,default=2048)
    parser.add_argument('--learning-rate',type=float,default=5e-5)
    parser.add_argument('--num-layers',type=int,default=8)
    parser.add_argument('--rank',type=int,default=8)
    parser.add_argument('--scale',type=float,default=16)
    parser.add_argument('--save-every',type=int,default=40)
    parser.add_argument('--eval-every',type=int,default=40)
    parser.add_argument('--gradient-accumulation',type=int,default=1)
    args=parser.parse_args()
    if not 1 <= args.iters <= 1000: raise ValueError('iters must be 1-1000')
    if not 512 <= args.max_seq_length <= 4096: raise ValueError('max sequence length must be 512-4096')
    if not math.isfinite(args.learning_rate) or not 0 < args.learning_rate <= 1e-3:
        raise ValueError('learning rate must be finite, positive and at most 0.001')
    if not 1 <= args.num_layers <= 36 or not 1 <= args.rank <= 64:
        raise ValueError('layers must be 1-36 and rank must be 1-64')
    if not math.isfinite(args.scale) or not 0 < args.scale <= 64:
        raise ValueError('scale must be finite, positive and at most 64')
    if not 1 <= args.save_every <= args.iters or not 1 <= args.eval_every <= args.iters:
        raise ValueError('save/evaluation intervals must be 1-iters')
    if not 1 <= args.gradient_accumulation <= 16:
        raise ValueError('gradient accumulation must be 1-16')
    state['total']=args.iters
    if STATE.exists():
        previous=json.loads(STATE.read_text())
        if previous.get('busy') and previous.get('pid') != os.getpid():
            try: os.kill(previous['pid'],0)
            except (ProcessLookupError,KeyError): pass
            else: raise RuntimeError('A local training run is already active')
    base=Path((HOME_ROOT/'base-path.txt').read_text().strip())
    data=args.data.resolve()
    for split in ['train','valid','test']:
        if not (data/f'{split}.jsonl').is_file(): raise FileNotFoundError(split)
    run_dir=HOME_ROOT/('run-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    run_dir.mkdir(exist_ok=False)
    binary=Path(sys.executable).parent
    quantized=HOME_ROOT/'qwen3-4b-mlx-4bit'
    adapters=run_dir/'adapters'
    config={'model':str(quantized),'data':str(data),'train':True,'test':True,
            'mask_prompt':True,'num_layers':args.num_layers,'batch_size':1,'iters':args.iters,
            'learning_rate':args.learning_rate,'max_seq_length':args.max_seq_length,'grad_checkpoint':True,
            'steps_per_report':5,'steps_per_eval':args.eval_every,'val_batches':8,'test_batches':4,
            'save_every':args.save_every,'grad_accumulation_steps':args.gradient_accumulation,
            'adapter_path':str(adapters),'seed':20261001,
            'lora_parameters':{'rank':args.rank,'scale':args.scale,'dropout':0.05},'report_to':None}
    (run_dir/'config.json').write_text(json.dumps(config,indent=2))
    (run_dir/'dataset-manifest.json').write_bytes((data/'manifest.json').read_bytes())
    (HOME_ROOT/'latest-run.txt').write_text(str(run_dir)+'\n')
    count=json.loads((data/'manifest.json').read_text())['counts']['train']
    update(note=f'Local QLoRA fine-tuning: {count} authored examples, held-out validation; inference pauses to free unified memory.')
    try:
        with urllib.request.urlopen('http://127.0.0.1:11434/api/tags',timeout=10) as response:
            names = [model['name'] for model in json.load(response)['models']
                     if re.fullmatch(r'workout-coach(?:(?:-v\d+)|(?:-mlx-control))?:latest', model['name'])]
        for name in names:
            subprocess.run(['ollama','stop',name],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if not quantized.exists():
            run([str(binary/'mlx_lm.convert'),'--hf-path',str(base),'--mlx-path',str(quantized),
                 '-q','--q-bits','4','--q-group-size','64'],run_dir/'convert.log','Converting base')
        run([str(binary/'mlx_lm.lora'),'--config',str(run_dir/'config.json')],run_dir/'train.log','Training')
        update(busy=False,stage='Adapter trained',step=args.iters,
               note='Adapter weights are saved. Behavioral evaluation and Ollama import are next; this candidate is not yet approved.')
        print('RUN_READY',str(run_dir),flush=True)
    except BaseException as error:
        update(busy=False,stage='Failed',note=f'{type(error).__name__}: {error}. Existing models and checkpoints are preserved.')
        raise


if __name__=='__main__':
    main()
