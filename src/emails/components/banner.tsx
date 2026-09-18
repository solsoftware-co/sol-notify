import { Img } from "@react-email/components";
import { spacing } from "../styles";

// Simplified from the old service's version: this takes a plain hosted image
// URL directly instead of a CID attachment reference (loadBannerAttachment's
// fetch-and-base64-embed step is dropped entirely — Resend serves remote
// image URLs natively, so there's nothing to embed).
export interface BannerProps {
  src?: string;
  height?: number;
  width?: number;
}

export function Banner({ src, height, width }: BannerProps = {}) {
  if (!src) return null;

  return (
    <table width="100%" role="presentation" style={{ paddingTop: spacing.xl, paddingBottom: spacing.xl }}>
      <tr>
        <td align="center">
          <Img
            src={src}
            alt="Sol Software"
            {...(width !== undefined && height === undefined ? {} : { height: height ?? 40 })}
            {...(width !== undefined ? { width } : {})}
            style={{ display: "block", outline: "none", border: "none", textDecoration: "none" }}
          />
        </td>
      </tr>
    </table>
  );
}
