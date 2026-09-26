---
name: uname
desc: system
index: false
man: |
  # UNAME(1)

  ## NAME
  uname — show system information

  ## SYNOPSIS
  uname

  ## DESCRIPTION
  Prints the system identity: kernel name, version and architecture
  (e.g. Lud'OS 3.0.0 x86_64 GNU/Terminal — the version is the
  site's release).

  ## EXAMPLES
  uname

  ## SEE ALSO
  date
js: |
  ctx.line(`Lud'OS ${ctx.cfg.version || '1.0'} x86_64 GNU/Terminal`);
---
