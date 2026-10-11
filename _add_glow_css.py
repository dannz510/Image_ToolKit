filepath = r'D:\Do not open\Extract IMG\dannz-ai-studio\src\styles\globals.css'
f = open(filepath, 'r')
content = f.read()
f.close()

# Add global button hover glow utilities before the reduced-motion media query
old = '''/* Reduced motion: kill every transition/animation for calmer UX. */'''

new = '''/* ==========================================================================
   Global glow utilities - applied to buttons that don't use the .btn* classes
   but still deserve the mica/glow treatment.
   ========================================================================== */
.glow-hover:hover {
  box-shadow: 0 0 0 1px rgba(214, 82, 58, 0.12);
}

.glow-active {
  box-shadow: 0 0 12px rgba(214, 82, 58, 0.35);
}

/* Selected/active option buttons in panels - amber rim + soft glow */
.option-active {
  box-shadow: 0 0 12px rgba(214, 82, 58, 0.35);
}

/* Reduced motion: kill every transition/animation for calmer UX. */'''

if old in content:
    content = content.replace(old, new)
    print("OK: glow utilities added")
else:
    print("FAIL: reduced-motion marker not found")

f = open(filepath, 'w')
f.write(content)
f.close()
print("DONE")
