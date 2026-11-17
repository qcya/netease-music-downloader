$ErrorActionPreference='Stop'
# Generate our own muted test inputs. Never use or record the user's audio.
Add-Type -AssemblyName System.Speech
$projectRoot=Split-Path $PSScriptRoot -Parent
$fixtureRoot=Join-Path $projectRoot '.validation'
New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
foreach($fixture in @(
 @{Culture='en-US';Name='alignment-english.wav';Text='Hello world. Music makes every day a little brighter.'},
 @{Culture='zh-CN';Name='alignment-chinese.wav';Text='让音乐陪伴每一天。今天也是美好的一天。'}
)) {
 $synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
 try {
  $voice=$synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq $fixture.Culture } | Select-Object -First 1
  if(!$voice){throw "A local $($fixture.Culture) SAPI voice is required for this optional model fixture."}
  $synth.SelectVoice($voice.VoiceInfo.Name)
  $synth.SetOutputToWaveFile((Join-Path $fixtureRoot $fixture.Name))
  $synth.Speak($fixture.Text)
 } finally { $synth.Dispose() }
}
