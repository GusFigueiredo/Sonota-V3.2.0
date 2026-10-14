#define MyAppName "Sonota"
#define MyAppVersion "3.2.0"
#define MyAppPublisher "Harmônico"
#define MyAppExeName "Sonota.exe"

[Setup]
AppId={{8B54E34D-3C2A-4D7A-91EE-A0B0E9662B1F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\Sonota
DefaultGroupName=Sonota
OutputBaseFilename=Sonota-Setup
OutputDir=output
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
SetupIconFile=staging\Sonota.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
MinVersion=10.0

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Files]
Source: "staging\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Sonota"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\Sonota"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Sonota"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\tools"

[Code]
var
  SoftwareLabel: TNewStaticText;
  ConfigLabel: TNewStaticText;
  ConfigProgress: TNewProgressBar;

function PowerShellPath(): String;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

procedure SetConfigProgress(const Value: Integer; const Text: String);
begin
  ConfigProgress.Position := Value;
  ConfigLabel.Caption := Text;
  ConfigProgress.Refresh;
  ConfigLabel.Refresh;
  WizardForm.StatusLabel.Caption := Text;
  WizardForm.StatusLabel.Refresh;
end;

procedure RunRequiredScript(const ScriptName, StatusText: String);
var
  ResultCode: Integer;
  Params: String;
  ScriptPath: String;
begin
  ScriptPath := ExpandConstant('{app}\tools\') + ScriptName;
  if not FileExists(ScriptPath) then
    RaiseException('Arquivo obrigatório do instalador não encontrado: ' + ScriptPath);

  WizardForm.StatusLabel.Caption := StatusText;
  WizardForm.StatusLabel.Refresh;
  Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath + '" -InstallRoot "' + ExpandConstant('{app}') + '"';

  if not Exec(PowerShellPath(), Params, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    RaiseException('Não foi possível iniciar ' + ScriptName + '.');

  if ResultCode <> 0 then
    RaiseException(
      'A preparação obrigatória do Sonota falhou em ' + ScriptName +
      ' (código ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
      'Consulte os logs em %LOCALAPPDATA%\Sonota\logs e execute o instalador novamente.'
    );
end;

procedure InitializeWizard();
var
  ParentControl: TWinControl;
begin
  ParentControl := WizardForm.ProgressGauge.Parent;

  SoftwareLabel := TNewStaticText.Create(WizardForm);
  SoftwareLabel.Parent := ParentControl;
  SoftwareLabel.Left := WizardForm.ProgressGauge.Left;
  SoftwareLabel.Top := WizardForm.ProgressGauge.Top - ScaleY(18);
  SoftwareLabel.Width := WizardForm.ProgressGauge.Width;
  SoftwareLabel.Caption := 'Instalação do software';

  ConfigLabel := TNewStaticText.Create(WizardForm);
  ConfigLabel.Parent := ParentControl;
  ConfigLabel.Left := WizardForm.ProgressGauge.Left;
  ConfigLabel.Top := WizardForm.ProgressGauge.Top + WizardForm.ProgressGauge.Height + ScaleY(22);
  ConfigLabel.Width := WizardForm.ProgressGauge.Width;
  ConfigLabel.Caption := 'Configuração de recursos — aguardando instalação do software';

  ConfigProgress := TNewProgressBar.Create(WizardForm);
  ConfigProgress.Parent := ParentControl;
  ConfigProgress.Left := WizardForm.ProgressGauge.Left;
  ConfigProgress.Top := ConfigLabel.Top + ScaleY(18);
  ConfigProgress.Width := WizardForm.ProgressGauge.Width;
  ConfigProgress.Height := WizardForm.ProgressGauge.Height;
  ConfigProgress.Min := 0;
  ConfigProgress.Max := 100;
  ConfigProgress.Position := 0;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    SoftwareLabel.Caption := 'Instalação do software';
    ConfigLabel.Caption := 'Configuração de recursos — aguardando instalação do software';
    ConfigProgress.Position := 0;
  end;

  if CurStep = ssPostInstall then
  begin
    SoftwareLabel.Caption := 'Instalação do software — concluída';

    SetConfigProgress(5, 'Iniciando configuração dos recursos...');
    SetConfigProgress(10, 'Verificando Microsoft Edge WebView2...');
    RunRequiredScript('ensure-webview2.ps1', 'Verificando Microsoft Edge WebView2...');
    SetConfigProgress(20, 'WebView2 pronto. Preparando Laboratório de Arranjos...');

    SetConfigProgress(25, 'Preparando Python, FFmpeg, MIDI, Partitura e Stems...');
    RunRequiredScript('install-audio.ps1', 'Preparando Laboratório de Arranjos (Python, MIDI, Partitura e Stems)...');
    SetConfigProgress(72, 'Laboratório configurado. Preparando IA local...');

    SetConfigProgress(76, 'Preparando Ollama e modelos Qwen...');
    RunRequiredScript('install-ai.ps1', 'Preparando IA local (Ollama e modelos Qwen)...');
    SetConfigProgress(98, 'Executando verificações finais...');

    SetConfigProgress(100, 'Configuração concluída — Sonota V3.2.0 pronto para usar.');
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := IsWin64;
  if not Result then
    MsgBox('O Sonota V3.2.0 requer Windows 64 bits.', mbError, MB_OK);
end;
