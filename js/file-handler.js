class FileHandler {
    constructor() {
        this.supportedFormats = ['jpg', 'jpeg', 'png', 'tiff', 'tif'];
        this.selectedFiles = [];
    }

    // File System Access API対応チェック
    isSupported() {
        return 'showDirectoryPicker' in window;
    }

    // フォルダ選択とファイル読み込み
    async selectFolder() {
        if (!this.isSupported()) {
            throw new Error('お使いのブラウザはフォルダ選択に対応していません。Chrome または Edge をご利用ください。');
        }

        try {
            const directoryHandle = await window.showDirectoryPicker();
            const files = await this.getFilesFromDirectory(directoryHandle);
            const imageFiles = this.filterImageFiles(files);
            
            this.selectedFiles = imageFiles;
            return imageFiles;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('フォルダ選択がキャンセルされました。');
            }
            throw new Error(`フォルダの読み込みに失敗しました: ${error.message}`);
        }
    }

    // ディレクトリから再帰的にファイルを取得
    async getFilesFromDirectory(directoryHandle, path = '') {
        const files = [];
        
        for await (const [name, handle] of directoryHandle.entries()) {
            const currentPath = path ? `${path}/${name}` : name;
            
            if (handle.kind === 'file') {
                const file = await handle.getFile();
                files.push({
                    file,
                    name: file.name,
                    path: currentPath,
                    size: file.size,
                    lastModified: file.lastModified
                });
            } else if (handle.kind === 'directory') {
                // サブディレクトリも再帰的に処理
                const subFiles = await this.getFilesFromDirectory(handle, currentPath);
                files.push(...subFiles);
            }
        }
        
        return files;
    }

    // 画像ファイルのフィルタリング
    filterImageFiles(files) {
        return files.filter(fileObj => {
            const extension = this.getFileExtension(fileObj.name);
            return this.supportedFormats.includes(extension);
        });
    }

    // ファイル拡張子を取得
    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    // ファイルをArrayBufferとして読み込み
    async readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsArrayBuffer(file);
        });
    }

    // ファイルをData URLとして読み込み（プレビュー用）
    async readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsDataURL(file);
        });
    }

    // 選択されたファイル一覧を取得
    getSelectedFiles() {
        return this.selectedFiles;
    }

    // ファイル数を取得
    getFileCount() {
        return this.selectedFiles.length;
    }

    // ファイルサイズを人間が読みやすい形式に変換
    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Byte';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}