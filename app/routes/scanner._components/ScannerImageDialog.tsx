import { Dialog } from "~/components/v2/primitives/Dialog";

// Full-size view of an original image. The title is the file name, so the dialog has an accessible name.
export default function ScannerImageDialog({
  open,
  title,
  src,
  alt,
  onClose,
}: {
  open: boolean;
  title: string;
  src: string | null;
  alt: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {src ? <img src={src} alt={alt} className="max-h-[75dvh] w-full object-contain" /> : null}
    </Dialog>
  );
}
