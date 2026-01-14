// Manuscript Reader App
(function() {
    'use strict';

    // IndexedDB for storing documents
    const DB_NAME = 'ManuscriptReaderDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'documents';

    let db = null;

    // Initialize IndexedDB
    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    // Save document to IndexedDB
    function saveDocumentToDB(name, arrayBuffer) {
        return new Promise((resolve, reject) => {
            if (!db) return reject(new Error('DB not initialized'));

            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.put({
                id: 'currentDocument',
                name: name,
                arrayBuffer: arrayBuffer,
                savedAt: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Load document from IndexedDB
    function loadDocumentFromDB() {
        return new Promise((resolve, reject) => {
            if (!db) return reject(new Error('DB not initialized'));

            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('currentDocument');

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Clear document from IndexedDB
    function clearDocumentFromDB() {
        return new Promise((resolve, reject) => {
            if (!db) return reject(new Error('DB not initialized'));

            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete('currentDocument');

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Configuration
    const CONFIG = {
        emailJS: {
            serviceId: 'service_43jb6qi',
            templateId: 'template_hg798mf',
            publicKey: 'spdM7Hl7V-jXXbAMn'
        }
    };

    // DOM Elements
    const elements = {
        uploadScreen: document.getElementById('upload-screen'),
        readerScreen: document.getElementById('reader-screen'),
        fileInput: document.getElementById('file-input'),
        docTitle: document.getElementById('doc-title'),
        readerContent: document.getElementById('reader-content'),
        readerHeader: document.querySelector('.reader-header'),
        backBtn: document.getElementById('back-btn'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsPanel: document.getElementById('settings-panel'),
        closeSettings: document.getElementById('close-settings'),
        commentModal: document.getElementById('comment-modal'),
        closeModal: document.getElementById('close-modal'),
        cancelComment: document.getElementById('cancel-comment'),
        submitComment: document.getElementById('submit-comment'),
        selectedText: document.getElementById('selected-text'),
        commentText: document.getElementById('comment-text'),
        progressBar: document.getElementById('progress-bar'),
        progressText: document.getElementById('progress-text'),
        fontDecrease: document.getElementById('font-decrease'),
        fontIncrease: document.getElementById('font-increase'),
        fontSizeDisplay: document.getElementById('font-size-display'),
        loading: document.getElementById('loading'),
        toast: document.getElementById('toast')
    };

    // State
    let state = {
        currentDocument: null,
        selectedParagraph: null,
        fontSize: 18,
        theme: 'dark',
        comments: [],
        savePositionTimeout: null,
        lastScrollTop: 0,
        headerHidden: false
    };

    // Initialize
    function init() {
        loadSettings();
        bindEvents();
        applyTheme(state.theme);
        applyFontSize(state.fontSize);

        // Initialize IndexedDB and check for saved document or load default
        initDB()
            .then(() => loadDocumentFromDB())
            .then(async (savedDoc) => {
                if (savedDoc && savedDoc.arrayBuffer) {
                    // Restore the saved document
                    state.currentDocument = {
                        name: savedDoc.name,
                        arrayBuffer: savedDoc.arrayBuffer
                    };

                    showLoading(true);
                    try {
                        await displayDocument();
                        showScreen('reader');
                        showToast('Restored your last document', 'success');
                    } catch (error) {
                        console.error('Error restoring document:', error);
                        state.currentDocument = null;
                        // Try loading default manuscript
                        await tryLoadDefaultManuscript();
                    } finally {
                        showLoading(false);
                    }
                } else {
                    // No saved document, try loading default manuscript
                    await tryLoadDefaultManuscript();
                }
            })
            .catch(async (error) => {
                console.error('Error with IndexedDB:', error);
                // Try loading default manuscript anyway
                await tryLoadDefaultManuscript();
            });
    }

    // Try to load the default manuscript file
    async function tryLoadDefaultManuscript() {
        try {
            showLoading(true);
            const response = await fetch('manuscript.docx');
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                state.currentDocument = {
                    name: 'Manuscript',
                    arrayBuffer: arrayBuffer
                };
                await displayDocument();
                showScreen('reader');
            } else {
                showScreen('upload');
            }
        } catch (error) {
            console.log('No default manuscript found, showing upload screen');
            showScreen('upload');
        } finally {
            showLoading(false);
        }
    }

    // Load saved settings
    function loadSettings() {
        const savedFontSize = localStorage.getItem('manuscript-fontSize');
        const savedTheme = localStorage.getItem('manuscript-theme');

        if (savedFontSize) state.fontSize = parseInt(savedFontSize);
        if (savedTheme) state.theme = savedTheme;
    }

    // Save settings
    function saveSettings() {
        localStorage.setItem('manuscript-fontSize', state.fontSize);
        localStorage.setItem('manuscript-theme', state.theme);
    }

    // Bind all event listeners
    function bindEvents() {
        // File upload
        elements.fileInput.addEventListener('change', handleFileUpload);

        // Navigation
        elements.backBtn.addEventListener('click', goBack);
        elements.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSettings();
        });
        elements.closeSettings.addEventListener('click', closeSettings);

        // Settings panel overlay click
        document.addEventListener('click', (e) => {
            if (elements.settingsPanel.classList.contains('active') &&
                !elements.settingsPanel.contains(e.target) &&
                e.target !== elements.settingsBtn) {
                closeSettings();
            }
        });

        // Font size controls
        elements.fontDecrease.addEventListener('click', () => changeFontSize(-2));
        elements.fontIncrease.addEventListener('click', () => changeFontSize(2));

        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                applyTheme(theme);
            });
        });

        // Comment modal
        elements.closeModal.addEventListener('click', closeCommentModal);
        elements.cancelComment.addEventListener('click', closeCommentModal);
        elements.submitComment.addEventListener('click', submitComment);
        elements.commentModal.querySelector('.modal-backdrop').addEventListener('click', closeCommentModal);

        // Scroll progress tracking and header hide/show
        // Note: actual scroll listener is attached after document renders (in setupScrollListener)

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);

        // Save position before page unload
        window.addEventListener('beforeunload', savePositionImmediately);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                savePositionImmediately();
            }
        });
    }

    // Save position immediately (for page unload)
    function savePositionImmediately() {
        if (!state.currentDocument) return;

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollHeight = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
        ) - window.innerHeight;
        const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

        const key = `manuscript-position-${state.currentDocument.name}`;

        // Don't overwrite a saved position with 0 (happens on page unload sometimes)
        if (progress === 0) {
            const existing = localStorage.getItem(key);
            if (existing) {
                const parsed = JSON.parse(existing);
                if (parsed.progress > 0) {
                    return; // Keep the existing non-zero position
                }
            }
        }

        localStorage.setItem(key, JSON.stringify({
            progress: progress,
            timestamp: Date.now()
        }));
    }

    // Handle file upload
    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.docx')) {
            showToast('Please upload a .docx file', 'error');
            return;
        }

        showLoading(true);

        try {
            const arrayBuffer = await file.arrayBuffer();

            state.currentDocument = {
                name: file.name.replace('.docx', ''),
                arrayBuffer: arrayBuffer
            };

            // Save to IndexedDB for persistence
            try {
                await saveDocumentToDB(state.currentDocument.name, arrayBuffer);
            } catch (e) {
                console.error('Failed to save document to DB:', e);
            }

            await displayDocument();
            showScreen('reader');
            showToast('Document loaded successfully', 'success');

        } catch (error) {
            console.error('Error parsing document:', error);
            console.error('Error details:', error.message, error.stack);
            showToast('Failed to parse document: ' + error.message, 'error');
        } finally {
            showLoading(false);
            elements.fileInput.value = '';
        }
    }

    // Display the parsed document
    async function displayDocument() {
        if (!state.currentDocument) return;

        elements.docTitle.textContent = state.currentDocument.name;
        elements.readerContent.innerHTML = '';

        // Use mammoth to convert docx to clean HTML
        const result = await mammoth.convertToHtml(
            { arrayBuffer: state.currentDocument.arrayBuffer },
            {
                styleMap: [
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "p[style-name='Title'] => h1.title:fresh",
                    "p[style-name='Subtitle'] => h2.subtitle:fresh",
                    "p[style-name='Chapter No.'] => p.chapter-number:fresh",
                    "p[style-name='Setting'] => p.scene-setting:fresh",
                    "p[style-name='POV Title'] => p.pov-label:fresh"
                ]
            }
        );

        // Create wrapper and insert HTML
        const wrapper = document.createElement('div');
        wrapper.className = 'manuscript-content';
        wrapper.innerHTML = result.value;

        elements.readerContent.appendChild(wrapper);

        // Post-process to detect and style special elements
        detectAndStyleSpecialParagraphs(wrapper);

        // Make paragraphs clickable for comments
        setupParagraphClickHandlers();

        // Attach scroll listener to the correct element
        setupScrollListener();

        // Restore saved reading position, or start at top
        restoreReadingPosition();
    }

    // Detect and style special paragraphs (chapters, scenes, POV, etc.)
    function detectAndStyleSpecialParagraphs(wrapper) {
        const paragraphs = wrapper.querySelectorAll('p');

        paragraphs.forEach((p, index) => {
            const text = p.textContent.trim();
            const textLower = text.toLowerCase();

            // Skip empty paragraphs
            if (!text) return;

            // Chapter numbers/titles - patterns like "Chapter 1", "CHAPTER ONE", "1", or just numbers
            if (/^chapter\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|\w+)$/i.test(text) ||
                /^part\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|\w+)$/i.test(text) ||
                /^prologue$/i.test(text) ||
                /^epilogue$/i.test(text) ||
                /^\d{1,3}$/.test(text)) {
                p.classList.add('chapter-number');
            }

            // Scene settings - short lines that look like time/place
            // Patterns: "The same time", "Location Name", "INT.", "EXT.", dates, times
            else if (text.length < 100 &&
                     (/^(INT\.|EXT\.|int\.|ext\.)/i.test(text) ||
                      /^the same (time|day|night|moment)/i.test(text) ||
                      /^(later|earlier|morning|afternoon|evening|night|dawn|dusk)/i.test(text) ||
                      /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(text) ||
                      /^\d{1,2}:\d{2}/.test(text) ||
                      /^(one|two|three|four|five|six|seven|eight|nine|ten)\s+(hour|day|week|month|year)/i.test(text) ||
                      // Short standalone lines that follow a chapter marker
                      (index > 0 && paragraphs[index - 1]?.classList?.contains('chapter-number') && text.length < 60))) {
                p.classList.add('scene-setting');
            }

            // POV labels - character names followed by POV or in brackets
            else if (/^[A-Z][A-Za-z\s]+('s)?\s*(POV|pov|P\.O\.V\.)$/i.test(text) ||
                     /^\[[A-Za-z\s]+\]$/.test(text) ||
                     /^(POV|pov|P\.O\.V\.):?\s*[A-Z]/i.test(text)) {
                p.classList.add('pov-label');
            }

            // Scene breaks - very short lines like "***" or "* * *" or "---"
            else if (/^[\*\-#~=\s]{1,10}$/.test(text) ||
                     /^•••$/.test(text)) {
                p.classList.add('scene-break');
            }
        });
    }

    // Apply reader theme styles to docx-preview output
    function applyReaderStyles() {
        const wrapper = elements.readerContent.querySelector('.docx-wrapper');
        if (!wrapper) return;

        // Remove ALL style attributes that might contain background colors
        const elementsWithStyle = wrapper.querySelectorAll('[style]');
        elementsWithStyle.forEach(el => {
            const style = el.getAttribute('style');
            // Remove background-related styles but keep others (like font-size)
            if (style) {
                const newStyle = style
                    .replace(/background[^;]*;?/gi, '')
                    .replace(/box-shadow[^;]*;?/gi, '')
                    .trim();
                if (newStyle) {
                    el.setAttribute('style', newStyle);
                } else {
                    el.removeAttribute('style');
                }
            }
        });

        // Also clean the wrapper itself
        const wrapperStyle = wrapper.getAttribute('style') || '';
        wrapper.setAttribute('style', wrapperStyle
            .replace(/background[^;]*;?/gi, '')
            .replace(/box-shadow[^;]*;?/gi, '')
        );
    }

    // Throttled scroll handler for better performance
    let scrollThrottleTimer = null;
    function throttledScrollHandler(e) {
        if (scrollThrottleTimer) return;
        scrollThrottleTimer = setTimeout(() => {
            scrollThrottleTimer = null;
            handleScroll(e);
        }, 100); // Only process scroll every 100ms
    }

    // Find and attach scroll listener to the actual scrolling element
    function setupScrollListener() {
        // Attach to window with passive flag for better scroll performance
        window.addEventListener('scroll', throttledScrollHandler, { passive: true });
        state.scrollContainer = document.documentElement;
    }

    // Setup long-press handlers using event delegation (much faster for large docs)
    function setupParagraphClickHandlers() {
        const LONG_PRESS_DURATION = 500;
        let pressTimer = null;
        let startX = 0;
        let startY = 0;
        let activeElement = null;

        const container = elements.readerContent;

        // Find the paragraph element from a touch/click target
        function findParagraph(target) {
            while (target && target !== container) {
                if (target.tagName && target.tagName.match(/^(P|H[1-6])$/)) {
                    return target;
                }
                target = target.parentElement;
            }
            return null;
        }

        // Touch start - begin long press timer
        container.addEventListener('touchstart', (e) => {
            const paragraph = findParagraph(e.target);
            if (!paragraph || !paragraph.textContent.trim()) return;

            activeElement = paragraph;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;

            pressTimer = setTimeout(() => {
                if (activeElement) {
                    activeElement.style.background = 'var(--highlight)';
                    if (navigator.vibrate) navigator.vibrate(50);
                    handleParagraphClick({ currentTarget: activeElement });
                }
            }, LONG_PRESS_DURATION);
        }, { passive: true });

        // Touch move - cancel if moved too far
        container.addEventListener('touchmove', (e) => {
            if (!activeElement) return;
            const moveX = Math.abs(e.touches[0].clientX - startX);
            const moveY = Math.abs(e.touches[0].clientY - startY);
            if (moveX > 10 || moveY > 10) {
                clearTimeout(pressTimer);
                activeElement.style.background = '';
                activeElement = null;
            }
        }, { passive: true });

        // Touch end - cancel timer
        container.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
            if (activeElement) {
                activeElement.style.background = '';
                activeElement = null;
            }
        }, { passive: true });

        // Desktop: click for non-touch devices
        container.addEventListener('click', (e) => {
            if ('ontouchstart' in window) return;
            const paragraph = findParagraph(e.target);
            if (paragraph && paragraph.textContent.trim()) {
                handleParagraphClick({ currentTarget: paragraph });
            }
        });
    }

    // Find the nearest chapter/heading before an element
    function findChapterContext(element) {
        // Get all headings in the document
        const allHeadings = Array.from(
            elements.readerContent.querySelectorAll('h1, h2, h3, h4, h5, h6, p')
        );

        // Find the element's position
        const elementIndex = allHeadings.indexOf(element);
        if (elementIndex === -1) {
            // Element not in list, search by position
            const allElements = Array.from(elements.readerContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
            const idx = allElements.indexOf(element);
            if (idx === -1) return null;

            // Look backwards for a heading
            for (let i = idx - 1; i >= 0; i--) {
                const el = allElements[i];
                if (el.tagName.match(/^H[1-6]$/)) {
                    return el.textContent.trim();
                }
            }
            return null;
        }

        // Look backwards for a heading
        for (let i = elementIndex - 1; i >= 0; i--) {
            const el = allHeadings[i];
            if (el.tagName.match(/^H[1-6]$/)) {
                return el.textContent.trim();
            }
        }

        return null;
    }

    // Handle paragraph click
    function handleParagraphClick(e) {
        const paragraph = e.currentTarget;
        const text = paragraph.textContent.trim();

        if (!text) return;

        // Find the chapter context
        const chapter = findChapterContext(paragraph);

        state.selectedParagraph = {
            id: paragraph.dataset.paragraphId,
            text: text,
            element: paragraph,
            chapter: chapter
        };

        // Show visual feedback
        paragraph.classList.add('tapped');
        setTimeout(() => paragraph.classList.remove('tapped'), 200);

        openCommentModal();
    }

    // Open comment modal
    function openCommentModal() {
        if (!state.selectedParagraph) return;

        elements.selectedText.textContent = truncateText(state.selectedParagraph.text, 300);
        elements.commentText.value = '';
        elements.commentModal.classList.add('active');

        // Focus textarea after animation
        setTimeout(() => elements.commentText.focus(), 300);
    }

    // Close comment modal
    function closeCommentModal() {
        elements.commentModal.classList.remove('active');
        state.selectedParagraph = null;
    }

    // Submit comment
    async function submitComment() {
        const comment = elements.commentText.value.trim();

        if (!comment) {
            showToast('Please enter a comment', 'error');
            return;
        }

        if (!state.selectedParagraph) {
            showToast('No paragraph selected', 'error');
            return;
        }

        elements.submitComment.disabled = true;
        elements.submitComment.textContent = 'Sending...';

        try {
            await sendCommentEmail({
                documentName: state.currentDocument.name,
                chapter: state.selectedParagraph.chapter,
                paragraphId: state.selectedParagraph.id,
                selectedText: state.selectedParagraph.text,
                comment: comment,
                timestamp: new Date().toISOString()
            });

            // Mark paragraph as commented
            state.selectedParagraph.element.classList.add('has-comment');

            // Store comment locally
            state.comments.push({
                paragraphId: state.selectedParagraph.id,
                text: state.selectedParagraph.text,
                comment: comment
            });

            showToast('Comment sent successfully!', 'success');
            closeCommentModal();

        } catch (error) {
            console.error('Error sending comment:', error);
            showToast('Failed to send comment. Please try again.', 'error');
        } finally {
            elements.submitComment.disabled = false;
            elements.submitComment.textContent = 'Send Comment';
        }
    }

    // Send comment via email
    async function sendCommentEmail(data) {
        // Method 1: Using your own backend
        if (CONFIG.emailEndpoint && !CONFIG.emailEndpoint.includes('YOUR_')) {
            const response = await fetch(CONFIG.emailEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    to: CONFIG.recipientEmail,
                    subject: `New Comment on "${data.documentName}"`,
                    documentName: data.documentName,
                    selectedText: data.selectedText,
                    comment: data.comment,
                    timestamp: data.timestamp
                })
            });

            if (!response.ok) {
                throw new Error('Failed to send email');
            }

            return response.json();
        }

        // Method 2: Using EmailJS (if configured)
        if (CONFIG.emailJS && CONFIG.emailJS.serviceId && !CONFIG.emailJS.serviceId.includes('YOUR_')) {
            // Dynamically load EmailJS if not loaded
            if (typeof emailjs === 'undefined') {
                await loadScript('https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js');
                emailjs.init(CONFIG.emailJS.publicKey);
            }

            return emailjs.send(CONFIG.emailJS.serviceId, CONFIG.emailJS.templateId, {
                document_name: data.documentName,
                chapter: data.chapter || 'N/A',
                selected_text: data.selectedText,
                comment: data.comment,
                timestamp: new Date(data.timestamp).toLocaleString()
            });
        }

        // Fallback: Log to console and show message (for demo/testing)
        console.log('=== Comment Submitted ===');
        console.log('Document:', data.documentName);
        if (data.chapter) console.log('Chapter:', data.chapter);
        console.log('Passage:', data.selectedText);
        console.log('Comment:', data.comment);
        console.log('Time:', new Date(data.timestamp).toLocaleString());
        console.log('========================');

        // For demo purposes, simulate success
        // In production, configure either the backend endpoint or EmailJS
        return Promise.resolve({ success: true, demo: true });
    }

    // Load external script dynamically
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Handle scroll - update progress and hide/show header
    function handleScroll(e) {
        // Get scroll position from window
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollHeight = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
        ) - window.innerHeight;

        const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

        // Update progress bar
        elements.progressBar.style.width = `${progress}%`;
        elements.progressText.textContent = `${Math.round(progress)}%`;

        // Hide/show header based on scroll direction
        const scrollDelta = scrollTop - state.lastScrollTop;
        const threshold = 10;

        if (scrollDelta > threshold && scrollTop > 50) {
            if (!state.headerHidden) {
                elements.readerHeader.classList.add('hidden');
                state.headerHidden = true;
            }
        } else if (scrollDelta < -threshold) {
            if (state.headerHidden) {
                elements.readerHeader.classList.remove('hidden');
                state.headerHidden = false;
            }
        }

        state.lastScrollTop = scrollTop;

        // Save reading position (debounced)
        saveReadingPosition(progress);
    }

    // Save reading position to localStorage (debounced)
    function saveReadingPosition(progress) {
        if (!state.currentDocument) return;

        // Clear existing timeout
        if (state.savePositionTimeout) {
            clearTimeout(state.savePositionTimeout);
        }

        // Save after 500ms of no scrolling
        state.savePositionTimeout = setTimeout(() => {
            const key = `manuscript-position-${state.currentDocument.name}`;
            localStorage.setItem(key, JSON.stringify({
                progress: progress,
                timestamp: Date.now()
            }));
        }, 500);
    }

    // Restore reading position from localStorage
    function restoreReadingPosition() {
        if (!state.currentDocument) return;

        const key = `manuscript-position-${state.currentDocument.name}`;
        const saved = localStorage.getItem(key);

        if (saved) {
            try {
                const { progress } = JSON.parse(saved);
                if (progress > 0) {
                    // Wait for docx-preview to fully render, then scroll
                    setTimeout(() => {
                        const scrollHeight = Math.max(
                            document.documentElement.scrollHeight,
                            document.body.scrollHeight
                        ) - window.innerHeight;

                        if (scrollHeight > 0) {
                            const targetScroll = (progress / 100) * scrollHeight;
                            window.scrollTo(0, targetScroll);
                            // Update progress bar
                            elements.progressBar.style.width = `${progress}%`;
                            elements.progressText.textContent = `${Math.round(progress)}%`;
                        }
                    }, 500);
                }
            } catch (e) {
                console.error('Error restoring position:', e);
            }
        }
    }

    // Screen management
    function showScreen(screen) {
        elements.uploadScreen.classList.remove('active');
        elements.readerScreen.classList.remove('active');

        if (screen === 'upload') {
            elements.uploadScreen.classList.add('active');
        } else if (screen === 'reader') {
            elements.readerScreen.classList.add('active');
        }
    }

    // Go back to upload screen
    async function goBack() {
        state.currentDocument = null;
        state.comments = [];

        // Clear saved document from IndexedDB
        try {
            await clearDocumentFromDB();
        } catch (e) {
            console.error('Failed to clear document from DB:', e);
        }

        showScreen('upload');
    }

    // Settings panel
    function openSettings() {
        elements.settingsPanel.classList.add('active');
    }

    function closeSettings() {
        elements.settingsPanel.classList.remove('active');
    }

    // Font size control
    function changeFontSize(delta) {
        const newSize = Math.min(32, Math.max(14, state.fontSize + delta));
        if (newSize !== state.fontSize) {
            state.fontSize = newSize;
            applyFontSize(newSize);
            saveSettings();
        }
    }

    function applyFontSize(size) {
        document.documentElement.style.setProperty('--reader-font-size', `${size}px`);
        elements.fontSizeDisplay.textContent = `${size}px`;
    }

    // Theme control
    function applyTheme(theme) {
        state.theme = theme;
        document.body.dataset.theme = theme;

        // Update active button
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });

        saveSettings();
    }

    // Loading overlay
    function showLoading(show) {
        elements.loading.classList.toggle('active', show);
    }

    // Toast notification
    function showToast(message, type = '') {
        elements.toast.textContent = message;
        elements.toast.className = 'toast show ' + type;

        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3000);
    }

    // Utility functions
    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    // Keyboard handling
    function handleKeyboard(e) {
        // Escape to close modals
        if (e.key === 'Escape') {
            if (elements.commentModal.classList.contains('active')) {
                closeCommentModal();
            } else if (elements.settingsPanel.classList.contains('active')) {
                closeSettings();
            }
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
