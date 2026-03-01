/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_LOT_DECODER_ACCESS_EMAILS?: string;
	readonly VITE_LOT_DECODER_ACCESS_USER_IDS?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
