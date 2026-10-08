$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPack = Join-Path $taskRoot 'Test/qa-content'
$taskScript = Join-Path $taskPack 'audio-script.txt'
if (-not (Test-Path -LiteralPath $taskScript -PathType Leaf)) {
  throw 'Run scripts/create-functional-qa.py first.'
}
Add-Type -AssemblyName System.Speech
$taskSpeech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $taskSpeech.SelectVoice('Microsoft Zira Desktop')
  $taskSpeech.Rate = -1
  $taskFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
  $taskSpeech.SetOutputToWaveFile((Join-Path $taskPack 'original-listening.wav'),$taskFormat)
  $taskSpeech.Speak([System.IO.File]::ReadAllText($taskScript))
} finally {
  $taskSpeech.Dispose()
}
Write-Output 'Created offline original QA audio; no external speech service used.'
