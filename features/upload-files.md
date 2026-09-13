---
title: upload files and create folders in the files view
status: done
priority: 60
---

Upload a log file or some data into the project from the files view,
and create a folder to put it in when there is no good place. Manager
side: `PUT /api/projects/:id/file` and `POST /api/projects/:id/dir`.

## Report (2026-09-13)

Done and deployed. Upload button and drop onto the tree, a new-folder
form, both into the focused or open directory (else the first
repository); an existing name asks before replacing; the toast after an
upload offers to mention the path to the agent last opened in the
project and takes you there with the draft prepared. Manager: raw-body
uploads of up to 25 MB, directories with missing parents, paths
validated as on the read side, through a hub as bytes; e2e tests on
both sides. Not done: uploading a whole folder, renaming or deleting.
