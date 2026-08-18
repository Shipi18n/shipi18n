Output check-demo.gif

Set FontSize 16
Set Width 1320
Set Height 640
Set Padding 22
Set Theme "Catppuccin Mocha"
Set PlaybackSpeed 1.0

Type "cat locales/es.json"    Sleep 400ms  Enter   Sleep 2.2s

Type "npx shipi18n check ./locales -s en"   Sleep 400ms  Enter   Sleep 6s

Type "# fix the placeholder, then check the meaning"  Sleep 300ms Enter Sleep 1.2s

Hide
Type `sed -i '' 's/Bienvenido de nuevo/Bienvenido de nuevo, {{name}}/' locales/es.json`
Enter
Sleep 1s
Show

Type "npx shipi18n check ./locales -s en --semantic"  Sleep 400ms  Enter  Sleep 14s

Sleep 3s
