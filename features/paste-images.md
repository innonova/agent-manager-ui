---
title: paste images into the chat
status: review
priority: 60
---

Paste (or drop) an image into the composer and have it go with the turn,
shown in the transcript. The manager side is `images-in-turns` in
`../agent-manager/features/`.

## Report (2026-09-13)

Done and deployed. Paste and drop handlers on the composer, thumbnails
with a remove button, the same limits as the manager's checked in the
box, sending with or without text, thumbnails on user items that open
full size. A Playwright test pastes a PNG through a synthetic clipboard
event, sees the attachment, sends, and sees it in the transcript and
noted by the fake agent. Not done: pasted images are not kept in the
draft across navigation.
