import { Modal } from "antd";
import { useTranslation } from "react-i18next";

import type { LibraryAssetItem } from "@/services/api/library";
import { LibraryBrowser } from "./library-browser";

type Props = {
    open: boolean;
    onSelect: (item: LibraryAssetItem) => void;
    onClose: () => void;
};

// Per-node "从素材库选择" picker: replaces (or fills) the node that triggered it,
// unlike AssetPickerModal's library tab which inserts a brand-new node.
export function LibraryPickerModal({ open, onSelect, onClose }: Props) {
    const { t } = useTranslation();
    return (
        <Modal title={t("canvas.assetPicker.library")} open={open} onCancel={onClose} footer={null} width={860} destroyOnHidden styles={{ body: { minHeight: 480 } }}>
            <LibraryBrowser onSelect={onSelect} actionLabel={t("canvas.imageTools.libraryReplace")} />
        </Modal>
    );
}
