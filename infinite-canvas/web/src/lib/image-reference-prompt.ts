import type { ReferenceImage } from "@/types/image";

import i18n from "@/i18n";

export function imageReferenceLabel(index: number) {
    return i18n.t("imageReferences.label", { index: index + 1 });
}

export function buildImageReferencePromptText(prompt: string, references: ReferenceImage[]) {
    const text = prompt.trim();
    if (!references.length) return text;
    const labels = references.map((reference, index) => `${imageReferenceLabel(index)}${reference.name ? `（${reference.name}）` : ""}`);
    return i18n.t("imageReferences.promptPrefix", { labels: labels.join(i18n.t("imageReferences.separator")), prompt: text });
}
