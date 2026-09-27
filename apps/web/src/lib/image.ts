/** Canvas-based downscale, shared by anything that sends a phone photo
 *  somewhere -- ScorecardImport.tsx (a scorecard, resized so Tesseract
 *  doesn't pay wall-clock time for pixels it doesn't need) and
 *  Photos.tsx (a trip photo, resized so an upload over a course's dead
 *  patch of signal doesn't time out). Same function, different
 *  `maxEdge`/`quality` per caller -- neither cares how the other tuned it. */
export function downscaleImage(file: File, maxEdge: number, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read the photo"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("could not read the photo"));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("could not read the photo"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(new File([blob], file.name, { type: "image/jpeg" })) : reject(new Error("could not read the photo"))),
          "image/jpeg",
          quality,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
