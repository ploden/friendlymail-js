/**
 * Interface for EmailAddress data type
 */
export interface IEmailAddress {
    getLocalPart(): string;
    getDomain(): string;
    toString(): string;
    equals(other: IEmailAddress): boolean;
}
