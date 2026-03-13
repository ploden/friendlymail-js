/**
 * Represents a photo attachment carried by an incoming or outgoing message.
 * By the time a PhotoAttachment is present on a message, the image data has
 * already been resized to 1080×1080 px JPEG by EmailMailProvider.
 */
export interface PhotoAttachment {
    /** Resized image bytes (JPEG). */
    data: Buffer;
    /** MIME content type (always 'image/jpeg' after processing). */
    contentType: string;
    /** Original filename of the attachment. */
    filename: string;
}
