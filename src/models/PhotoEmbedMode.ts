/**
 * Controls how photo attachments are embedded in HTML notification messages.
 *
 * - 'cid'    Use a Content-ID inline attachment reference (cid:post_photo).
 *            The image is sent as a MIME inline attachment and referenced by
 *            CID in the HTML. This is the standard approach for production email
 *            and is supported by all major email clients.
 *
 * - 'base64' Embed the image directly in the HTML as a base64-encoded data URI
 *            (data:image/jpeg;base64,...). The message is self-contained and can
 *            be rendered in a browser without a MIME attachment. Useful for the
 *            simulator. Note: some email clients (e.g. Gmail) strip data URIs.
 */
export type PhotoEmbedMode = 'cid' | 'base64';
