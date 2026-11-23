# Fonts

`Oswald-latin.woff2` is the variable Oswald (wght 200-700) latin
subset from Google Fonts (fonts.gstatic.com, v57). Oswald is (c) The Oswald Project Authors,
licensed under the SIL Open Font License 1.1 (https://openfontlicense.org).

They are bundled locally because `next/font/google` intermittently failed to self-host Oswald
(see tests/ui/fonts.test.ts). Inter and JetBrains Mono still use `next/font/google`.
