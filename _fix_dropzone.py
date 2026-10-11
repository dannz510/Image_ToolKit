filepath = r'D:\Do not open\Extract IMG\dannz-ai-studio\src\components\workspace\DropZone.tsx'
f = open(filepath, 'r')
content = f.read()
f.close()

# Replace the content section - responsive text and mica drop zone
old_content = """        <p className="hero-accent font-mono text-[11px] uppercase tracking-[0.34em] animate-rise-in">
          Dannz AI Studio
        </p>
        <h1 className="hero-title mt-3 max-w-xl font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight animate-line-in sm:text-5xl lg:text-6xl">
          Background removal
          <br />
          built into every layer
        </h1>
        <p className="hero-sub mt-4 max-w-md font-mono text-sm leading-relaxed animate-rise-in [animation-delay:120ms]">
          {t('drop.subtitle')}
        </p>

        <div
          className={`drop-zone mt-8 max-w-xl animate-rise-in [animation-delay:200ms] ${
            isDragging || hover ? 'drop-zone-active' : ''
          }}`"""

new_content = """        <p className="hero-accent font-mono text-[11px] uppercase tracking-[0.34em] animate-rise-in">
          Dannz AI Studio
        </p>
        <h1 className="hero-title mt-3 max-w-xl font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight animate-line-in sm:text-4xl lg:text-5xl">
          Background removal
          <br />
          built into every layer
        </h1>
        <p className="hero-sub mt-4 max-w-md font-mono text-sm leading-relaxed animate-rise-in [animation-delay:120ms]">
          {t('drop.subtitle')}
        </p>

        <div
          className={`drop-zone mica mt-8 max-w-xl animate-rise-in [animation-delay:200ms] ${
            isDragging || hover ? 'drop-zone-active' : ''
          }}`"""

if old_content in content:
    content = content.replace(old_content, new_content)
    print("OK: content section updated")
else:
    print("FAIL: content section not found")
    # Debug
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'hero-title' in line:
            print(f"Line {i}: {repr(line)}")

# Also update the browse button with glow
old_browse = "          <button type=\"button\" className=\"btn-primary mt-4\" onClick={openPicker}>"
new_browse = "          <button type=\"button\" className=\"btn-primary mt-4\" onClick={openPicker}>"
# The btn-primary already has glow via CSS, no change needed here

f = open(filepath, 'w')
f.write(content)
f.close()
print("DONE")
