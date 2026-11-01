"""Export a preserved fused model using pinned official llama.cpp tools.

Use Q8_0 to minimize further quantization when exporting the dequantized MLX
training base. Never overwrite model names, fused weights or prior exports.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / 'ai/training/local-state.json'
HOME_ROOT = Path.home() / 'workout-ai/powerbuild-v1'
TOOLS = Path.home() / 'workout-ai/tools/llama-b11297'


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--name', required=True)
    parser.add_argument('--run', type=Path)
    parser.add_argument('--source', choices=['mlx-base', 'full-base'], default='mlx-base')
    parser.add_argument('--system', type=Path, help='Serving system file; defaults to system.txt')
    args = parser.parse_args()
    if not re.fullmatch(r'workout-coach-v[1-9]\d*', args.name):
        raise ValueError('Use a separate versioned workout-coach name')
    with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=10) as response:
        if any(model['name'] == args.name + ':latest' for model in json.load(response)['models']):
            raise RuntimeError('Model name already exists; choose the next version')
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    if state.get('busy'):
        try:
            os.kill(state['pid'], 0)
        except ProcessLookupError:
            pass
        else:
            raise RuntimeError('Another local model job is active')
    run = (args.run or Path((HOME_ROOT / 'latest-run.txt').read_text().strip())).resolve()
    source = run / ('fused-safetensors' if args.source == 'mlx-base' else 'fused-full-base')
    source_manifest_path = run / ('candidate-manifest.json' if args.source == 'mlx-base' else 'candidate-manifest-full-base.json')
    source_manifest = json.loads(source_manifest_path.read_text())
    if not (source / 'config.json').is_file():
        raise FileNotFoundError('Prepare fused weights first with import_candidate.py')
    if json.loads((source / 'config.json').read_text()).get('quantization'):
        raise ValueError('llama.cpp expects dequantized Safetensors')
    converter = TOOLS / 'src/llama.cpp-b11297/convert_hf_to_gguf.py'
    if not converter.is_file() or not (TOOLS / 'provenance.json').is_file():
        raise FileNotFoundError('Pinned official llama.cpp converter and provenance required')
    output = run / f'export-{args.name}'
    output.mkdir(exist_ok=False)
    state.update(busy=True, pid=os.getpid(), stage='Exporting GGUF',
                 note=f'Exporting {args.name} from {args.source}; original models remain preserved.')

    def update(**fields):
        state.update(fields, updatedAt=datetime.now(timezone.utc).isoformat())
        temporary = STATE.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(state, indent=2))
        temporary.replace(STATE)

    update()
    try:
        gguf = output / 'coach-Q8_0.gguf'
        with (output / 'convert.log').open('x') as log:
            subprocess.run([sys.executable, str(converter), str(source), '--outfile', str(gguf),
                            '--outtype', 'q8_0'], check=True, stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, 'HF_HUB_OFFLINE': '1', 'HF_HUB_DISABLE_IMPLICIT_TOKEN': '1'})
        system_path = (args.system or ROOT / 'ai/training/system.txt').resolve()
        system = system_path.read_text().strip()
        modelfile = output / 'Modelfile'
        modelfile.write_text(f'FROM {gguf}\nPARAMETER temperature 0.2\nPARAMETER top_k 20\n'
                            f'PARAMETER top_p 0.8\nPARAMETER repeat_penalty 1\n'
                            f'PARAMETER num_ctx 8192\nPARAMETER num_predict 4096\nSYSTEM """{system}"""\n')
        update(stage='Importing GGUF')
        with (output / 'import.log').open('x') as log:
            subprocess.run(['ollama', 'create', args.name, '-f', str(modelfile)], check=True,
                           stdout=log, stderr=subprocess.STDOUT)
        with gguf.open('rb') as handle:
            digest = hashlib.file_digest(handle, 'sha256').hexdigest()
        manifest = {'model': args.name, 'source': str(source), 'source_type': args.source,
                    'selected_checkpoint': source_manifest['selected_step'], 'quantization': 'Q8_0', 'gguf_sha256': digest,
                    'adapter_sha256': source_manifest['adapter_sha256'],
                    'system_sha256': hashlib.sha256(system.encode()).hexdigest(), 'system_path': str(system_path),
                    'llama_cpp': json.loads((TOOLS / 'provenance.json').read_text()),
                    'dataset': json.loads((run / 'dataset-manifest.json').read_text()),
                    'status': 'experimental; behavioral acceptance required', 'published': False}
        (output / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        update(busy=False, stage=f'{args.name} imported', note='A separate candidate is available; compare its actual answers before approving it.')
        print('IMPORTED', args.name, output, flush=True)
    except BaseException as error:
        update(busy=False, stage='GGUF export failed', note=f'{type(error).__name__}: {error}. Previous weights and logs are preserved.')
        raise


if __name__ == '__main__':
    main()
