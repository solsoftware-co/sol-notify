import { Img } from "@react-email/components";
import { spacing } from "../styles";

// `src` is always the inline attachment reference (BANNER_CID_SRC,
// "cid:banner_image"), not a hosted URL — the image is downloaded and
// attached to each email at send time so it keeps rendering even if its
// source URL later stops serving. See lib/banner-attachment.ts.
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
