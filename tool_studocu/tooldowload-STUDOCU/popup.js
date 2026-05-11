// Trạng thái
function updateStatus(msg, isProcessing = false) {
    console.log(msg); // Status UI has been removed
}

async function clearCookiesAndReload(tab, btnElement = null) {
    if (btnElement) {
        btnElement.style.opacity = '0.5';
        btnElement.style.pointerEvents = 'none';
        const heading = btnElement.querySelector('.btn-heading');
        if (heading) heading.innerText = "Đang xử lý...";
    }

    try {
        const allCookies = await chrome.cookies.getAll({});
        for (const cookie of allCookies) {
            if (cookie.domain.includes('studocu')) {
                let cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
                const protocol = cookie.secure ? "https:" : "http:";
                const url = `${protocol}//${cleanDomain}${cookie.path}`;
                await chrome.cookies.remove({ url: url, name: cookie.name, storeId: cookie.storeId });
            }
        }

        // Chờ một chút để việc xóa cookie kịp ảnh hưởng tới mạng
        await new Promise(r => setTimeout(r, 300));

        chrome.tabs.reload(tab.id);

    } catch (e) {
        alert("Lỗi: " + e.message);
        if (btnElement) {
            btnElement.style.opacity = '1';
            btnElement.style.pointerEvents = 'auto';
            const heading = btnElement.querySelector('.btn-heading');
            if (heading) heading.innerText = "Xem file & Xóa Watermark";
        }
    }
}

// Xem file & Xóa Watermark (chỉ reload)
document.getElementById('clearBtn').addEventListener('click', async (e) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes("studocu")) {
        alert("⚠️ Tính năng này chỉ hoạt động trên trang Studocu."); return;
    }
    clearCookiesAndReload(tab, e.currentTarget);
});

// Tải File PDF (bản gốc - không cuộn tự động)
document.getElementById('checkBtn').addEventListener('click', async (e) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes("studocu")) {
        alert("⚠️ Tính năng này chỉ hoạt động trên trang Studocu."); return;
    }

    try {
        await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["viewer_styles.css"]
        });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: runCleanViewerInside
        });
    } catch (err) {
        alert("⚠️ Lỗi: " + err.message);
    }
});

// Hàm gốc xuất PDF
function runCleanViewerInside() {
    const pages = document.querySelectorAll('div[data-page-index]');
    if (pages.length === 0) {
        alert("⚠️ Không tìm thấy trang nào.\n(Hãy cuộn chuột xuống cuối tài liệu để web tải hết nội dung trước!)");
        return;
    }

    if (!confirm(`Sẵn sàng tạo PDF cho tài liệu gồm ${pages.length} trang.\nBấm OK để bắt đầu xử lý...`)) return;

    const SCALE_FACTOR = 4;
    const HEIGHT_SCALE_DIVISOR = 4;

    function copyComputedStyle(source, target, scaleFactor, shouldScaleHeight = false, shouldScaleWidth = false, heightScaleDivisor = 4, widthScaleDivisor = 4, shouldScaleMargin = false, marginScaleDivisor = 4) {
        const computedStyle = window.getComputedStyle(source);

        const normalProps = [
            'position', 'left', 'top', 'bottom', 'right',
            'font-family', 'font-weight', 'font-style',
            'color', 'background-color',
            'text-align', 'white-space',
            'display', 'visibility', 'opacity', 'z-index',
            'text-shadow', 'unicode-bidi', 'font-feature-settings', 'padding'
        ];

        const scaleProps = ['font-size', 'line-height'];
        let styleString = '';

        normalProps.forEach(prop => {
            const value = computedStyle.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
                styleString += `${prop}: ${value} !important; `;
            }
        });

        const widthValue = computedStyle.getPropertyValue('width');
        if (widthValue && widthValue !== 'none' && widthValue !== 'auto') {
            if (shouldScaleWidth) {
                const numValue = parseFloat(widthValue);
                if (!isNaN(numValue) && numValue > 0) {
                    const unit = widthValue.replace(numValue.toString(), '');
                    styleString += `width: ${numValue / widthScaleDivisor}${unit} !important; `;
                } else {
                    styleString += `width: ${widthValue} !important; `;
                }
            } else {
                styleString += `width: ${widthValue} !important; `;
            }
        }

        const heightValue = computedStyle.getPropertyValue('height');
        if (heightValue && heightValue !== 'none' && heightValue !== 'auto') {
            if (shouldScaleHeight) {
                const numValue = parseFloat(heightValue);
                if (!isNaN(numValue) && numValue > 0) {
                    const unit = heightValue.replace(numValue.toString(), '');
                    styleString += `height: ${numValue / heightScaleDivisor}${unit} !important; `;
                } else {
                    styleString += `height: ${heightValue} !important; `;
                }
            } else {
                styleString += `height: ${heightValue} !important; `;
            }
        }

        ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach(prop => {
            const value = computedStyle.getPropertyValue(prop);
            if (value && value !== 'auto') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    if (shouldScaleMargin && numValue !== 0) {
                        const unit = value.replace(numValue.toString(), '');
                        styleString += `${prop}: ${numValue / marginScaleDivisor}${unit} !important; `;
                    } else {
                        styleString += `${prop}: ${value} !important; `;
                    }
                }
            }
        });

        scaleProps.forEach(prop => {
            const value = computedStyle.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue) && numValue !== 0) {
                    const unit = value.replace(numValue.toString(), '');
                    styleString += `${prop}: ${numValue / scaleFactor}${unit} !important; `;
                } else {
                    styleString += `${prop}: ${value} !important; `;
                }
            }
        });

        let transformOrigin = computedStyle.getPropertyValue('transform-origin');
        if (transformOrigin) {
            styleString += `transform-origin: ${transformOrigin} !important; -webkit-transform-origin: ${transformOrigin} !important; `;
        }

        styleString += 'overflow: visible !important; max-width: none !important; max-height: none !important; clip: auto !important; clip-path: none !important; ';
        target.style.cssText += styleString;
    }

    function deepCloneWithStyles(element, scaleFactor, heightScaleDivisor, depth = 0) {
        const clone = element.cloneNode(false);
        const hasTextClass = element.classList && element.classList.contains('t');
        const hasUnderscoreClass = element.classList && element.classList.contains('_');

        const shouldScaleMargin = element.tagName === 'SPAN' &&
            element.classList &&
            element.classList.contains('_') &&
            Array.from(element.classList).some(cls => /^_(?:\d+[a-z]*|[a-z]+\d*)$/i.test(cls));

        copyComputedStyle(element, clone, scaleFactor, hasTextClass, hasUnderscoreClass, heightScaleDivisor, 4, shouldScaleMargin, scaleFactor);

        if (element.classList && element.classList.contains('pc')) {
            clone.style.setProperty('transform', 'none', 'important');
            clone.style.setProperty('-webkit-transform', 'none', 'important');
            clone.style.setProperty('overflow', 'visible', 'important');
            clone.style.setProperty('max-width', 'none', 'important');
            clone.style.setProperty('max-height', 'none', 'important');
        }

        if (element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
            clone.textContent = element.textContent;
        } else {
            element.childNodes.forEach(child => {
                if (child.nodeType === 1) {
                    clone.appendChild(deepCloneWithStyles(child, scaleFactor, heightScaleDivisor, depth + 1));
                } else if (child.nodeType === 3) {
                    clone.appendChild(child.cloneNode(true));
                }
            });
        }
        return clone;
    }

    // Build
    const viewerContainer = document.createElement('div');
    viewerContainer.id = 'clean-viewer-container';

    let successCount = 0;

    pages.forEach((page, index) => {
        const pc = page.querySelector('.pc');
        let width = 595.3; //Fallback A4
        let height = 841.9;

        if (pc) {
            const pcStyle = window.getComputedStyle(pc);
            const pcWidth = parseFloat(pcStyle.width);
            const pcHeight = parseFloat(pcStyle.height);

            if (!isNaN(pcWidth) && pcWidth > 0 && !isNaN(pcHeight) && pcHeight > 0) {
                width = pcWidth;
                height = pcHeight;
            } else {
                const rect = pc.getBoundingClientRect();
                if (rect.width > 10 && rect.height > 10) {
                    width = rect.width;
                    height = rect.height;
                }
            }
        }

        const newPage = document.createElement('div');
        newPage.className = 'std-page';
        newPage.id = `page-${index + 1}`;
        newPage.setAttribute('data-page-number', index + 1);

        newPage.style.width = width + 'px';
        newPage.style.height = height + 'px';

        // Layer ảnh
        const originalImg = page.querySelector('img.bi') || page.querySelector('img');
        if (originalImg) {
            const bgLayer = document.createElement('div');
            bgLayer.className = 'layer-bg';
            const imgClone = originalImg.cloneNode(true);
            imgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover; object-position: top center';
            bgLayer.appendChild(imgClone);
            newPage.appendChild(bgLayer);
        }

        // Layer text
        const originalPc = page.querySelector('.pc');
        if (originalPc) {
            const textLayer = document.createElement('div');
            textLayer.className = 'layer-text';
            const pcClone = deepCloneWithStyles(originalPc, SCALE_FACTOR, HEIGHT_SCALE_DIVISOR);

            pcClone.querySelectorAll('img').forEach(img => img.style.display = 'none');
            textLayer.appendChild(pcClone);
            newPage.appendChild(textLayer);
        }

        viewerContainer.appendChild(newPage);
        successCount++;
    });

    document.body.appendChild(viewerContainer);

    setTimeout(() => {
        window.print();
    }, 1000);
}

// Lưu thành ảnh
document.getElementById('captureBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes("studocu")) {
        alert("⚠️ Tính năng này chỉ hoạt động trên trang Studocu.");
        return;
    }

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            const visiblePages = [];
            const pages = document.querySelectorAll('div[data-page-index]'); // Cấu trúc của Studocu

            pages.forEach((page, index) => {
                const rect = page.getBoundingClientRect();
                // Kiểm tra phần tử trang có đang nằm trong viewport không
                if (rect.top < window.innerHeight && rect.bottom > 0) {
                    visiblePages.push({ element: page, index: index + 1 });
                }
            });

            if (visiblePages.length === 0) {
                alert("⚠️ Không tìm thấy trang nào trên màn hình. Hãy cuộn đến trang tài liệu bạn muốn chụp!");
                return [];
            }

            const imagesToDownload = [];
            visiblePages.forEach(item => {
                const img = item.element.querySelector('img.bi') || item.element.querySelector('img');
                if (img && img.src) {
                    // Trả về ảnh có độ phân giải cao nhất đã tải
                    imagesToDownload.push({ src: img.src, name: `page_${item.index}.png` });
                }
            });

            if (imagesToDownload.length === 0) {
                alert("⚠️ Không tìm thấy dữ liệu ảnh của trang này. Trang có thể đang bị che mờ hoặc chưa tải xong.");
            }
            return imagesToDownload;
        }
    }, (results) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
        }

        if (results && results[0] && results[0].result && results[0].result.length > 0) {
            results[0].result.forEach(imgData => {
                chrome.downloads.download({
                    url: imgData.src,
                    filename: `BanhMi_Studocu_${imgData.name}`,
                    saveAs: false
                });
            });
        }
    });
});

// Logic modal QR
document.addEventListener('DOMContentLoaded', () => {
    const qrPromoBtn = document.getElementById('qrPromoBtn');
    const qrModal = document.getElementById('qrModal');
    const qrClose = document.querySelector('.qr-close');

    if (qrPromoBtn && qrModal && qrClose) {
        qrPromoBtn.addEventListener('click', () => {
            qrModal.style.display = 'flex';
        });

        qrClose.addEventListener('click', () => {
            qrModal.style.display = 'none';
        });

        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) {
                qrModal.style.display = 'none';
            }
        });
    }
});
