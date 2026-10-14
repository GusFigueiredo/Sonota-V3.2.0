"""Worker de áudio do Sonota.

Cada trabalho executa em um processo Python isolado. O arquivo de origem nunca é
alterado; todas as saídas são gravadas na pasta temporária do trabalho.
"""
import argparse
import importlib
import json
import math
import shutil
import subprocess
import sys
import wave
from pathlib import Path


def _probe(module, label):
    try:
        importlib.import_module(module)
        return True, ''
    except Exception as exc:  # diagnóstico para a interface/instalador
        return False, f'{label}: {type(exc).__name__}: {exc}'


def capabilities():
    details = {}
    numpy_ok, numpy_err = _probe('numpy', 'NumPy')
    librosa_ok, librosa_err = _probe('librosa', 'librosa')
    analysis = numpy_ok and librosa_ok
    if not analysis:
        details['analysis'] = numpy_err or librosa_err

    basic_ok, basic_err = _probe('basic_pitch.inference', 'Basic Pitch')
    midi = basic_ok
    if not midi:
        details['midi'] = basic_err

    music21_ok, music21_err = _probe('music21', 'music21')
    partitura = midi and music21_ok
    if not partitura:
        details['partitura'] = basic_err or music21_err

    demucs_ok, demucs_err = _probe('demucs.separate', 'Demucs')
    torch_ok, torch_err = _probe('torch', 'PyTorch')
    ffmpeg_ok = shutil.which('ffmpeg') is not None
    stems = demucs_ok and torch_ok and ffmpeg_ok
    if not stems:
        details['stems'] = demucs_err or torch_err or 'FFmpeg não foi encontrado no PATH do Sonota.'

    enabled = [name for name, value in {
        'analysis': analysis, 'midi': midi, 'partitura': partitura, 'stems': stems
    }.items() if value]
    reason = 'Recursos de áudio prontos.' if len(enabled) == 4 else 'Alguns recursos de áudio ainda não estão disponíveis.'
    return {
        'analysis': analysis,
        'midi': midi,
        'partitura': partitura,
        'stems': stems,
        'reason': reason,
        'details': details,
        'python': f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}'
    }


def analyze(source):
    import librosa
    import numpy as np
    # Até 180 s para estimativa. O arquivo original nunca é modificado.
    y, sr = librosa.load(source, sr=22050, mono=True, duration=180)
    if len(y) < sr or np.max(np.abs(y)) < 1e-5:
        raise ValueError('Áudio muito curto ou silencioso para análise.')
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.asarray(tempo).reshape(-1)[0])
    chroma = librosa.feature.chroma_stft(y=y, sr=sr).mean(axis=1)
    major = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
    minor = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
    names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
    scores = [(float(np.corrcoef(chroma,np.roll(profile,i))[0,1]),names[i]+suffix)
              for profile,suffix in [(major,''),(minor,'m')] for i in range(12)]
    scores = [x for x in scores if np.isfinite(x[0])]
    best = max(scores) if scores else (0.0,'')
    return {
        'bpm': round(bpm,1) if 20<=bpm<=300 else None,
        'key': best[1],
        'keyCorrelation': round(best[0],3),
        'analyzedSeconds': round(len(y)/sr,2),
        'note':'Estimativas de tempo e tonalidade. Revise antes de usar musicalmente.'
    }


def _transcription_source(source, output):
    """Normaliza a entrada para WAV PCM antes do Basic Pitch.

    Isso evita diferenças de codec entre MP3/OGG/FLAC nas instalações do Windows.
    """
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        return source
    target = output / '_entrada_transcricao.wav'
    cmd = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
           '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', str(target)]
    run = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if run.returncode != 0:
        raise RuntimeError(f'FFmpeg não conseguiu preparar o áudio: {run.stderr.strip()[-600:]}')
    return target


def process(kind, source, output):
    if kind == 'analysis':
        return analyze(source)

    if kind in ('midi','partitura'):
        from basic_pitch.inference import predict
        prepared = _transcription_source(source, output)
        _, midi, _ = predict(str(prepared))
        if not any(instrument.notes for instrument in midi.instruments):
            raise ValueError('O modelo não encontrou notas suficientes para transcrever.')
        midi_path = output / 'transcricao.mid'
        midi.write(str(midi_path))
        if not midi_path.exists() or midi_path.stat().st_size == 0:
            raise RuntimeError('O Basic Pitch concluiu, mas o arquivo MIDI não foi criado.')
        if kind == 'midi':
            return {'output':midi_path.name,'engine':'Basic Pitch (ONNX/CPU)','note':'Transcrição automática; revise as notas.'}

        from music21 import converter
        score = converter.parse(str(midi_path))
        score_path = output / 'partitura.musicxml'
        score.write('musicxml', fp=str(score_path))
        if not score_path.exists() or score_path.stat().st_size == 0:
            raise RuntimeError('A conversão para MusicXML não gerou um arquivo válido.')
        return {
            'output':score_path.name,
            'engine':'Basic Pitch + music21',
            'note':'Abra no MuseScore e revise a quantização, compassos e vozes.'
        }

    if kind == 'stems':
        import demucs.separate
        separated = output / 'separated'
        # CPU por padrão para funcionar em qualquer PC. Os pesos htdemucs são
        # preparados pelo instalador e ficam no cache do usuário.
        demucs.separate.main(['-n','htdemucs','-d','cpu','--out',str(separated),str(source)])
        stems = sorted(separated.rglob('*.wav'))
        stem_names = {s.stem.lower() for s in stems}
        expected = {'vocals','drums','bass','other'}
        if not expected.issubset(stem_names):
            raise ValueError(f'O Demucs não gerou os quatro stems esperados. Encontrados: {", ".join(sorted(stem_names)) or "nenhum"}.')
        import zipfile
        zip_path = output / 'stems.zip'
        with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
            for stem in stems:
                if stem.stem.lower() in expected:
                    archive.write(stem, stem.name)
        if not zip_path.exists() or zip_path.stat().st_size == 0:
            raise RuntimeError('O pacote ZIP de stems não foi criado.')
        return {'output':zip_path.name,'engine':'Demucs htdemucs (CPU)','stems':['vocals','drums','bass','other']}

    raise ValueError('Tipo de trabalho inválido.')


def _write_test_wav(path):
    sr = 22050
    seconds = 2
    with wave.open(str(path), 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sr)
        frames = bytearray()
        for i in range(sr * seconds):
            value = int(math.sin(2 * math.pi * 440 * i / sr) * 10000)
            frames.extend(int(value).to_bytes(2, 'little', signed=True))
        stream.writeframes(bytes(frames))


def self_test(output):
    output.mkdir(parents=True, exist_ok=True)
    source = output / '_teste.wav'
    _write_test_wav(source)
    result = process('midi', source, output)
    return {'ok': True, 'midi': result}


def prepare_models():
    # Faz o download do htdemucs durante a instalação, em vez de surpreender o
    # usuário no primeiro clique em "Separar stems".
    from demucs.pretrained import get_model
    model = get_model('htdemucs')
    return {'ok': True, 'demucs': getattr(model, 'name', 'htdemucs')}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--capabilities', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--prepare-models', action='store_true')
    parser.add_argument('--type', choices=['analysis','midi','partitura','stems'])
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()

    if args.capabilities:
        print(json.dumps(capabilities(), ensure_ascii=False))
        return
    if args.prepare_models:
        print(json.dumps(prepare_models(), ensure_ascii=False))
        return
    if args.self_test:
        if not args.output:
            parser.error('--output é obrigatório com --self-test')
        print(json.dumps(self_test(args.output), ensure_ascii=False))
        return
    if not args.type or not args.input or not args.output:
        parser.error('--type, --input e --output são obrigatórios')

    args.output.mkdir(parents=True,exist_ok=True)
    result = process(args.type,args.input,args.output)
    (args.output/'result.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')


if __name__ == '__main__':
    main()
