filepath = r'D:\Do not open\Extract IMG\dannz-ai-studio\src\components\workspace\DropZone.tsx'
f = open(filepath, 'r')
content = f.read()
f.close()

# Check each line individually
tests = [
    '        <p className="hero-accent font-mono text-[11px] uppercase tracking-[0.34em] animate-rise-in">',
    "          Dannz AI Studio",
    '        </p>',
    '        <h1 className="hero-title mt-3 max-w-xl font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight animate-line-in sm:text-5xl lg:text-6xl">',
    "          Background removal",
    "          <br />",
    "          built into every layer",
    '        </h1>',
    '        <p className="hero-sub mt-4 max-w-md font-mono text-sm leading-relaxed animate-rise-in [animation-delay:120ms]">',
    "          {t('drop.subtitle')}",
    '        </p>',
    '',
    '        <div',
    '          className={`drop-zone mt-8 max-w-xl animate-rise-in [animation-delay:200ms] ${',
    "            isDragging || hover ? 'drop-zone-active' : ''",
    '          }}`',
]

for i, test in enumerate(tests):
    if test not in content:
        print(f"NOT FOUND at index {i}: {repr(test[:80])}")
    else:
        print(f"OK at index {i}")

# Now try the replacement line by line
import re

# Replace h1 text size
content = content.replace(
    'text-4xl font-extrabold uppercase leading-[0.95] tracking-tight animate-line-in sm:text-5xl lg:text-6xl',
    'text-3xl font-extrabold uppercase leading-[0.95] tracking-tight animate-line-in sm:text-4xl lg:text-5xl'
)
print("OK: h1 text size reduced")

# Replace drop-zone class to add mica
content = content.replace(
    'className={`drop-zone mt-8 max-w-xl animate-rise-in [animation-delay:200ms] ${',
    'className={`drop-zone mica mt-8 max-w-xl animate-rise-in [animation-delay:200ms] ${'
)
print("OK: drop-zone mica added")

f = open(filepath, 'w')
f.write(content)
f.close()
print("DONE")
