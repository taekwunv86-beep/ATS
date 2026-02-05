// =====================================================
// PDF Manual Masking Module
// PDF 파일에서 수동으로 마스킹 영역을 지정하여 처리
// =====================================================

const PdfManualMasking = {
    // 상태 관리
    state: {
        pdfDoc: null,           // PDF.js 문서 객체
        currentPage: 1,         // 현재 페이지
        totalPages: 0,          // 전체 페이지 수
        scale: 1.5,             // 렌더링 스케일
        selectedRegions: [],    // 선택된 마스킹 영역 [{page, x, y, width, height}, ...]
        isDrawing: false,       // 드래그 중 여부
        startX: 0,              // 드래그 시작 X
        startY: 0,              // 드래그 시작 Y
        originalFile: null,     // 원본 파일
        arrayBuffer: null,      // PDF ArrayBuffer
    },

    /**
     * 수동 마스킹 모달 열기
     */
    async openMaskingModal(file, onComplete) {
        this.state.originalFile = file;
        this.state.selectedRegions = [];
        this.state.currentPage = 1;
        this.onComplete = onComplete;

        try {
            // PDF 로드
            const arrayBuffer = await file.arrayBuffer();
            this.state.arrayBuffer = arrayBuffer.slice(0); // 복사본 저장

            this.state.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
            this.state.totalPages = this.state.pdfDoc.numPages;

            // 모달 생성 및 표시
            this.createModal();
            await this.renderPage(this.state.currentPage);

        } catch (error) {
            console.error('PDF 로드 오류:', error);
            alert('PDF 파일을 로드할 수 없습니다: ' + error.message);
        }
    },

    /**
     * 모달 UI 생성
     */
    createModal() {
        // 기존 모달 제거
        const existingModal = document.getElementById('pdfMaskingModal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'pdfMaskingModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                <!-- 헤더 -->
                <div class="px-6 py-4 border-b flex items-center justify-between">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800">
                            <i class="fas fa-edit text-orange-500 mr-2"></i>PDF 마스킹 영역 선택
                        </h3>
                        <p class="text-sm text-gray-500 mt-1">마우스로 드래그하여 마스킹할 영역을 선택하세요</p>
                    </div>
                    <button id="closeMaskingModal" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>

                <!-- 툴바 -->
                <div class="px-6 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <!-- 페이지 네비게이션 -->
                        <div class="flex items-center gap-2">
                            <button id="prevPage" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <span class="text-sm">
                                페이지 <span id="currentPageNum">1</span> / <span id="totalPageNum">1</span>
                            </span>
                            <button id="nextPage" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>

                        <!-- 확대/축소 -->
                        <div class="flex items-center gap-2">
                            <button id="zoomOut" class="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">
                                <i class="fas fa-search-minus"></i>
                            </button>
                            <span id="zoomLevel" class="text-sm">150%</span>
                            <button id="zoomIn" class="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">
                                <i class="fas fa-search-plus"></i>
                            </button>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <span id="regionCount" class="text-sm text-gray-600">선택 영역: 0개</span>
                        <button id="clearRegions" class="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm">
                            <i class="fas fa-trash mr-1"></i>전체 초기화
                        </button>
                    </div>
                </div>

                <!-- PDF 미리보기 영역 -->
                <div class="flex-1 overflow-auto p-4 bg-gray-100" id="pdfViewerContainer">
                    <div class="relative inline-block" id="canvasContainer">
                        <canvas id="pdfCanvas" class="shadow-lg"></canvas>
                        <!-- 선택 영역 오버레이 -->
                        <div id="selectionOverlay" class="absolute top-0 left-0 w-full h-full pointer-events-none"></div>
                        <!-- 드래그 영역 표시 -->
                        <div id="dragRect" class="absolute border-2 border-orange-500 bg-orange-200 bg-opacity-30 hidden"></div>
                    </div>
                </div>

                <!-- 선택된 영역 목록 -->
                <div class="px-6 py-3 border-t bg-gray-50 max-h-32 overflow-y-auto" id="regionListContainer">
                    <div id="regionList" class="flex flex-wrap gap-2">
                        <span class="text-sm text-gray-400">선택된 영역이 없습니다</span>
                    </div>
                </div>

                <!-- 푸터 -->
                <div class="px-6 py-4 border-t flex items-center justify-between">
                    <p class="text-xs text-gray-500">
                        <i class="fas fa-info-circle mr-1"></i>
                        Tip: 영역을 클릭하면 삭제할 수 있습니다
                    </p>
                    <div class="flex gap-3">
                        <button id="cancelMasking" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                            취소
                        </button>
                        <button id="applyMasking" class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
                            <i class="fas fa-check mr-2"></i>마스킹 적용 후 업로드
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.bindEvents();
    },

    /**
     * 이벤트 바인딩
     */
    bindEvents() {
        const canvas = document.getElementById('pdfCanvas');
        const canvasContainer = document.getElementById('canvasContainer');

        // 모달 닫기
        document.getElementById('closeMaskingModal').onclick = () => this.closeModal();
        document.getElementById('cancelMasking').onclick = () => this.closeModal();

        // 페이지 네비게이션
        document.getElementById('prevPage').onclick = () => this.goToPage(this.state.currentPage - 1);
        document.getElementById('nextPage').onclick = () => this.goToPage(this.state.currentPage + 1);

        // 확대/축소
        document.getElementById('zoomIn').onclick = () => this.setZoom(this.state.scale + 0.25);
        document.getElementById('zoomOut').onclick = () => this.setZoom(this.state.scale - 0.25);

        // 영역 초기화
        document.getElementById('clearRegions').onclick = () => this.clearAllRegions();

        // 마스킹 적용
        document.getElementById('applyMasking').onclick = () => this.applyMaskingAndUpload();

        // 캔버스 드래그 이벤트
        canvasContainer.onmousedown = (e) => this.onMouseDown(e);
        canvasContainer.onmousemove = (e) => this.onMouseMove(e);
        canvasContainer.onmouseup = (e) => this.onMouseUp(e);
        canvasContainer.onmouseleave = (e) => this.onMouseUp(e);

        // 터치 이벤트 (모바일 지원)
        canvasContainer.ontouchstart = (e) => this.onTouchStart(e);
        canvasContainer.ontouchmove = (e) => this.onTouchMove(e);
        canvasContainer.ontouchend = (e) => this.onTouchEnd(e);

        this.updateUI();
    },

    /**
     * 페이지 렌더링
     */
    async renderPage(pageNum) {
        const page = await this.state.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.state.scale });

        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        this.renderSelectionOverlay();
        this.updateUI();
    },

    /**
     * 선택 영역 오버레이 렌더링
     */
    renderSelectionOverlay() {
        const overlay = document.getElementById('selectionOverlay');
        const currentPageRegions = this.state.selectedRegions.filter(r => r.page === this.state.currentPage);

        overlay.innerHTML = currentPageRegions.map((region, idx) => {
            const globalIdx = this.state.selectedRegions.findIndex(r =>
                r.page === region.page && r.x === region.x && r.y === region.y
            );
            return `
                <div class="absolute bg-orange-500 bg-opacity-40 border-2 border-orange-600 cursor-pointer hover:bg-opacity-60 flex items-center justify-center"
                     style="left: ${region.x}px; top: ${region.y}px; width: ${region.width}px; height: ${region.height}px;"
                     onclick="PdfManualMasking.removeRegion(${globalIdx})"
                     title="클릭하여 삭제">
                    <span class="bg-orange-600 text-white text-xs px-1 rounded">${globalIdx + 1}</span>
                </div>
            `;
        }).join('');

        this.updateRegionList();
    },

    /**
     * 영역 목록 업데이트
     */
    updateRegionList() {
        const regionList = document.getElementById('regionList');
        const regionCount = document.getElementById('regionCount');

        regionCount.textContent = `선택 영역: ${this.state.selectedRegions.length}개`;

        if (this.state.selectedRegions.length === 0) {
            regionList.innerHTML = '<span class="text-sm text-gray-400">선택된 영역이 없습니다</span>';
            return;
        }

        regionList.innerHTML = this.state.selectedRegions.map((region, idx) => `
            <span class="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm">
                <span class="font-medium">#${idx + 1}</span>
                <span class="text-xs text-orange-500">(p.${region.page})</span>
                <button onclick="PdfManualMasking.removeRegion(${idx})" class="ml-1 text-orange-400 hover:text-orange-600">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('');
    },

    /**
     * UI 상태 업데이트
     */
    updateUI() {
        document.getElementById('currentPageNum').textContent = this.state.currentPage;
        document.getElementById('totalPageNum').textContent = this.state.totalPages;
        document.getElementById('zoomLevel').textContent = Math.round(this.state.scale * 100) + '%';

        document.getElementById('prevPage').disabled = this.state.currentPage <= 1;
        document.getElementById('nextPage').disabled = this.state.currentPage >= this.state.totalPages;
        document.getElementById('applyMasking').disabled = this.state.selectedRegions.length === 0;
    },

    /**
     * 페이지 이동
     */
    async goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.state.totalPages) return;
        this.state.currentPage = pageNum;
        await this.renderPage(pageNum);
    },

    /**
     * 줌 설정
     */
    async setZoom(scale) {
        if (scale < 0.5 || scale > 3) return;
        this.state.scale = scale;
        await this.renderPage(this.state.currentPage);
    },

    /**
     * 마우스 다운 - 드래그 시작
     */
    onMouseDown(e) {
        const canvas = document.getElementById('pdfCanvas');
        const rect = canvas.getBoundingClientRect();

        this.state.isDrawing = true;
        this.state.startX = e.clientX - rect.left;
        this.state.startY = e.clientY - rect.top;

        const dragRect = document.getElementById('dragRect');
        dragRect.style.left = this.state.startX + 'px';
        dragRect.style.top = this.state.startY + 'px';
        dragRect.style.width = '0px';
        dragRect.style.height = '0px';
        dragRect.classList.remove('hidden');
    },

    /**
     * 마우스 이동 - 드래그 중
     */
    onMouseMove(e) {
        if (!this.state.isDrawing) return;

        const canvas = document.getElementById('pdfCanvas');
        const rect = canvas.getBoundingClientRect();

        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const dragRect = document.getElementById('dragRect');
        const x = Math.min(this.state.startX, currentX);
        const y = Math.min(this.state.startY, currentY);
        const width = Math.abs(currentX - this.state.startX);
        const height = Math.abs(currentY - this.state.startY);

        dragRect.style.left = x + 'px';
        dragRect.style.top = y + 'px';
        dragRect.style.width = width + 'px';
        dragRect.style.height = height + 'px';
    },

    /**
     * 마우스 업 - 드래그 종료
     */
    onMouseUp(e) {
        if (!this.state.isDrawing) return;
        this.state.isDrawing = false;

        const canvas = document.getElementById('pdfCanvas');
        const rect = canvas.getBoundingClientRect();

        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const x = Math.min(this.state.startX, currentX);
        const y = Math.min(this.state.startY, currentY);
        const width = Math.abs(currentX - this.state.startX);
        const height = Math.abs(currentY - this.state.startY);

        const dragRect = document.getElementById('dragRect');
        dragRect.classList.add('hidden');

        // 최소 크기 체크 (10x10 픽셀 이상)
        if (width >= 10 && height >= 10) {
            this.state.selectedRegions.push({
                page: this.state.currentPage,
                x: x,
                y: y,
                width: width,
                height: height,
                scale: this.state.scale // 현재 스케일 저장
            });
            this.renderSelectionOverlay();
        }
    },

    /**
     * 터치 이벤트 핸들러
     */
    onTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    },

    onTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    },

    onTouchEnd(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        this.onMouseUp({ clientX: touch.clientX, clientY: touch.clientY });
    },

    /**
     * 영역 삭제
     */
    removeRegion(index) {
        this.state.selectedRegions.splice(index, 1);
        this.renderSelectionOverlay();
        this.updateUI();
    },

    /**
     * 전체 영역 초기화
     */
    clearAllRegions() {
        if (this.state.selectedRegions.length > 0 && !confirm('모든 선택 영역을 삭제하시겠습니까?')) {
            return;
        }
        this.state.selectedRegions = [];
        this.renderSelectionOverlay();
        this.updateUI();
    },

    /**
     * 마스킹 적용 및 업로드
     */
    async applyMaskingAndUpload() {
        if (this.state.selectedRegions.length === 0) {
            alert('마스킹할 영역을 선택해주세요.');
            return;
        }

        try {
            const applyBtn = document.getElementById('applyMasking');
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>마스킹 처리 중...';

            // pdf-lib로 마스킹 적용
            const maskedPdfBytes = await this.applyMaskingToPdf();

            // 새 File 객체 생성
            const maskedFile = new File(
                [maskedPdfBytes],
                this.state.originalFile.name,
                { type: 'application/pdf' }
            );

            this.closeModal();

            // 콜백 호출
            if (this.onComplete) {
                this.onComplete(maskedFile, this.state.selectedRegions.length);
            }

        } catch (error) {
            console.error('마스킹 적용 오류:', error);
            alert('마스킹 적용 중 오류가 발생했습니다: ' + error.message);

            const applyBtn = document.getElementById('applyMasking');
            applyBtn.disabled = false;
            applyBtn.innerHTML = '<i class="fas fa-check mr-2"></i>마스킹 적용 후 업로드';
        }
    },

    /**
     * PDF에 마스킹 적용
     */
    async applyMaskingToPdf() {
        const { PDFDocument, rgb } = PDFLib;

        // PDF 로드
        const pdfDoc = await PDFDocument.load(this.state.arrayBuffer.slice(0));
        const pages = pdfDoc.getPages();

        // 각 선택 영역에 마스킹 적용
        for (const region of this.state.selectedRegions) {
            const page = pages[region.page - 1];
            if (!page) continue;

            const { width: pageWidth, height: pageHeight } = page.getSize();

            // 스케일 보정하여 실제 PDF 좌표로 변환
            const scaleFactor = 1 / region.scale;
            const pdfX = region.x * scaleFactor;
            const pdfWidth = region.width * scaleFactor;
            const pdfHeight = region.height * scaleFactor;
            // PDF 좌표계는 좌하단이 원점이므로 y 변환
            const pdfY = pageHeight - (region.y * scaleFactor) - pdfHeight;

            // 흰색 박스 그리기
            page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: pdfWidth,
                height: pdfHeight,
                color: rgb(1, 1, 1), // 흰색
                borderColor: rgb(0.85, 0.85, 0.85),
                borderWidth: 0.5,
            });

            // "***" 텍스트 그리기
            try {
                const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                const fontSize = Math.min(pdfHeight * 0.6, 14);
                page.drawText('***', {
                    x: pdfX + (pdfWidth / 2) - 10,
                    y: pdfY + (pdfHeight / 2) - (fontSize / 2),
                    size: fontSize,
                    font: font,
                    color: rgb(0.6, 0.6, 0.6),
                });
            } catch (fontError) {
                console.warn('폰트 오류:', fontError);
            }
        }

        return await pdfDoc.save();
    },

    /**
     * 모달 닫기
     */
    closeModal() {
        const modal = document.getElementById('pdfMaskingModal');
        if (modal) modal.remove();

        // 상태 초기화
        this.state.pdfDoc = null;
        this.state.selectedRegions = [];
        this.state.arrayBuffer = null;
        this.state.originalFile = null;
    }
};

// Export
window.PdfManualMasking = PdfManualMasking;
