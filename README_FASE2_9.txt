SONOTA V2.7 - DESKTOP FASE 2.9

Correção principal:
- O Basic Pitch 0.4.0 usa pkg_resources.
- Setuptools 82+ removeu pkg_resources.
- O ambiente de áudio agora fixa setuptools==81.0.0 e valida import pkg_resources antes de testar MIDI/Partitura.
- O build valida a assinatura SONOTA_AUDIO_INSTALLER_V29_PKG_RESOURCES_PIN para impedir empacotar script antigo.

Mantidas as correções anteriores de stderr, Demucs, FFmpeg, arquivos de áudio e desktop.
