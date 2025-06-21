class FileHandler {
    constructor() {
        this.supportedFormats = ['jpg', 'jpeg', 'png', 'tiff', 'tif'];
        this.selectedFiles = [];
        this.directoryHandle = null; // ディレクトリハンドルを保持
        this.fileHandles = new Map(); // ファイルハンドルのキャッシュ
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
            this.directoryHandle = await window.showDirectoryPicker();
            const files = await this.getFilesFromDirectory(this.directoryHandle);
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
                const fileData = {
                    file,
                    name: file.name,
                    path: currentPath,
                    size: file.size,
                    lastModified: file.lastModified,
                    handle: handle // ファイルハンドルを保持
                };
                files.push(fileData);
                
                // ファイルハンドルキャッシュに保存
                this.fileHandles.set(currentPath, handle);
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

    // ファイルパスからファイルを再取得（遅延読み込み用）
    async getFileByPath(filePath) {
        try {
            const handle = this.fileHandles.get(filePath);
            if (!handle) {
                throw new Error(`ファイルハンドルが見つかりません: ${filePath}`);
            }
            return await handle.getFile();
        } catch (error) {
            console.error(`ファイル再取得エラー (${filePath}):`, error);
            throw error;
        }
    }

    // ファイルパスから画像をData URLとして読み込み
    async readImageAsDataURL(filePath) {
        try {
            const file = await this.getFileByPath(filePath);
            return await this.readFileAsDataURL(file);
        } catch (error) {
            console.error(`画像読み込みエラー (${filePath}):`, error);
            throw error;
        }
    }

    // 軽量版: フォルダ選択（Fileオブジェクトを保持しない）
    async selectFolderLite() {
        if (!this.isSupported()) {
            throw new Error('お使いのブラウザはフォルダ選択に対応していません。Chrome または Edge をご利用ください。');
        }

        try {
            this.directoryHandle = await window.showDirectoryPicker();
            const files = await this.getFilesFromDirectoryLite(this.directoryHandle);
            const imageFiles = this.filterImageFiles(files);
            
            this.selectedFiles = imageFiles;
            console.log(`⚡ 軽量モード: ${imageFiles.length}枚の画像を検出`);
            return imageFiles;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('フォルダ選択がキャンセルされました。');
            }
            throw new Error(`フォルダの読み込みに失敗しました: ${error.message}`);
        }
    }

    // 軽量版: ディレクトリからファイルを取得（最小限の情報のみ）
    async getFilesFromDirectoryLite(directoryHandle, path = '') {
        const files = [];
        
        for await (const [name, handle] of directoryHandle.entries()) {
            const currentPath = path ? `${path}/${name}` : name;
            
            if (handle.kind === 'file') {
                // Fileオブジェクトを取得しないでメタデータのみ保持
                const fileData = {
                    name: name,
                    path: currentPath,
                    handle: handle // ハンドルのみ保持
                };
                files.push(fileData);
                
                // ファイルハンドルキャッシュに保存
                this.fileHandles.set(currentPath, handle);
            } else if (handle.kind === 'directory') {
                // サブディレクトリも再帰的に処理
                const subFiles = await this.getFilesFromDirectoryLite(handle, currentPath);
                files.push(...subFiles);
            }
        }
        
        return files;
    }
}