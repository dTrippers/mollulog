declare module "sanitize-html" {
  type AllowedAttributes = Record<string, Array<string>>;

  export interface IOptions {
    allowedTags?: Array<string> | false;
    allowedAttributes?: AllowedAttributes | false;
    allowedSchemes?: Array<string>;
    allowProtocolRelative?: boolean;
  }

  export interface SanitizeHtml {
    (dirty: string, options?: IOptions): string;
    defaults: {
      allowedTags: Array<string>;
      allowedAttributes: AllowedAttributes;
    };
  }

  const sanitizeHtml: SanitizeHtml;
  export default sanitizeHtml;
}
