---
"@shipi18n/core": patch
"@shipi18n/cli": patch
---

`empty-value` no longer fires when a separator (a source with no letters or digits, such as Rails `number.format.delimiter: ","`) is translated to a space, U+00A0 or U+202F: that is the locale's real thousands separator. A space for a real word, and `""` for anything, are still errors. Found on good_job es/fr/ru (6 false errors → 0).
