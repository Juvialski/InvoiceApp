from pathlib import Path

path = Path("src/lib/persistence.ts")
text = path.read_text()
old = '''    const attachmentId = attachment.attachmentId || attachment.partId || `part-${index}`;
    const attachmentStorageToken = await storageTokenForOpaqueId(attachmentId, "Gmail attachment ID");'''
new = '''    const attachmentId: string = attachment.attachmentId || attachment.partId || `part-${index}`;
    const attachmentStorageToken: string = await storageTokenForOpaqueId(attachmentId, "Gmail attachment ID");'''
if old not in text:
    raise RuntimeError("Missing Gmail attachment type-fix anchor")
path.write_text(text.replace(old, new, 1))
print("Continuation lint fix applied.")
