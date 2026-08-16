import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { toPng } from "html-to-image";

/**
 * Captures an already-laid-out DOM node (may be positioned off-screen,
 * must not be display:none — html-to-image needs real dimensions to
 * measure) to a PNG and hands it to the platform's share sheet, or
 * downloads it on web. Same native/web split and return-value contract
 * as backup.ts's exportBackup: returns false on failure *and* on a
 * cancelled native share, not just success/failure, so a caller never
 * has to guess which one happened.
 *
 * No `encoding` option on the native Filesystem.writeFile call —
 * omitting it (unlike exportBackup's `Encoding.UTF8` for JSON text) is
 * what tells Capacitor this is base64 binary data, not a text file.
 */
export async function shareProgressCard(node: HTMLElement, filenameHint: string): Promise<boolean> {
  try {
    const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${filenameHint}-${stamp}.png`;

    if (Capacitor.isNativePlatform()) {
      const base64 = dataUrl.split(",")[1] ?? "";
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: filename,
        url: writeResult.uri,
        dialogTitle: "Share your progress",
      });
      toast.success("Ready to share", { duration: 4000 });
    } else {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Image downloaded", { duration: 4000 });
    }
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return false;
    console.error(err);
    toast.error("Couldn't create share image", { duration: 4000 });
    return false;
  }
}
