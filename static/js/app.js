// Global Application State
const state = {
    rawEntries: [],     // Raw entries from the XML feed
    updates: [],        // Parsed individual updates
    filteredUpdates: [],// Updates after search & category filters
    selectedUpdate: null,// Currently active update for Tweeting
    currentFilter: 'all',
    searchQuery: '',
    includeLink: true,
    lastUpdated: null
};

// DOM Elements
const elements = {
    timelineContainer: document.getElementById('timeline-container'),
    refreshBtn: document.getElementById('refresh-btn'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    lastUpdatedTime: document.getElementById('last-updated-time'),
    searchInput: document.getElementById('search-input'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    
    // States
    loaderState: document.getElementById('loader-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    errorRetryBtn: document.getElementById('error-retry-btn'),
    emptyState: document.getElementById('empty-state'),
    clearFiltersBtn: document.getElementById('clear-filters-btn'),
    
    // Stats
    statTotal: document.getElementById('stat-total'),
    statFeatures: document.getElementById('stat-features'),
    statChanges: document.getElementById('stat-changes'),
    statOthers: document.getElementById('stat-others'),
    statCards: document.querySelectorAll('.stat-card'),

    // Composer
    composerSidebar: document.getElementById('composer-sidebar'),
    composerEmptyState: document.getElementById('composer-empty-state'),
    composerActiveState: document.getElementById('composer-active-state'),
    closeComposerBtn: document.getElementById('close-composer-btn'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    mockupTimestamp: document.getElementById('mockup-timestamp'),
    toggleLinkCheckbox: document.getElementById('toggle-link'),
    charCounter: document.getElementById('char-counter'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    copyBtnText: document.getElementById('copy-btn-text'),
    publishTweetBtn: document.getElementById('publish-tweet-btn'),
    
    // Mobile Drawer
    mobileComposerTrigger: document.getElementById('mobile-composer-trigger'),
    mobileBadgeDot: document.getElementById('mobile-badge-dot')
};

// ==========================================================================
// Initialization & Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Fetch initial data
    fetchReleases();

    // Event Listeners
    elements.refreshBtn.addEventListener('click', () => fetchReleases(true));
    elements.exportCsvBtn.addEventListener('click', exportToCSV);
    elements.errorRetryBtn.addEventListener('click', () => fetchReleases(true));
    elements.clearFiltersBtn.addEventListener('click', resetFilters);
    
    // Search input handler with debounce
    let searchTimeout;
    elements.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.searchQuery = e.target.value.trim();
            applyFilters();
        }, 150);
    });

    // Category filter button handlers
    elements.filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });

    // Stats card quick filters
    elements.statCards.forEach(card => {
        card.addEventListener('click', () => {
            const filterType = card.dataset.filter;
            let targetBtn;
            if (filterType === 'all') {
                targetBtn = document.querySelector('.filter-btn[data-filter="all"]');
            } else if (filterType === 'feature') {
                targetBtn = document.querySelector('.filter-btn[data-filter="Feature"]');
            } else if (filterType === 'change') {
                targetBtn = document.querySelector('.filter-btn[data-filter="Change"]');
            } else {
                // Clicking "others" selects Announcements as a representative
                targetBtn = document.querySelector('.filter-btn[data-filter="Announcement"]');
            }
            if (targetBtn) targetBtn.click();
        });
    });

    // Composer controls
    elements.toggleLinkCheckbox.addEventListener('change', (e) => {
        state.includeLink = e.target.checked;
        if (state.selectedUpdate) {
            updateComposerText();
        }
    });

    elements.tweetTextarea.addEventListener('input', (e) => {
        updateCharCounter(e.target.value);
    });

    elements.copyTweetBtn.addEventListener('click', copyTweetToClipboard);
    elements.publishTweetBtn.addEventListener('click', openXIntent);

    // Mobile layout UI controls
    elements.closeComposerBtn.addEventListener('click', toggleComposerDrawer);
    elements.mobileComposerTrigger.addEventListener('click', () => {
        elements.composerSidebar.classList.add('open');
        elements.mobileBadgeDot.classList.add('hidden');
    });
});

// ==========================================================================
// Data Fetching and XML Parsing
// ==========================================================================
async function fetchReleases(forceRefresh = false) {
    showState('loading');
    
    // Rotate sync button
    elements.refreshBtn.classList.add('refreshing');
    elements.refreshBtn.disabled = true;
    
    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to parse releases');
        }
        
        state.rawEntries = data.entries;
        state.lastUpdated = new Date(data.last_updated * 1000);
        
        // Parse raw feed entries into individual updates
        processFeedEntries();
        
        // Render stats & list
        updateStats();
        applyFilters();
        
        // Update sync timestamp display
        elements.lastUpdatedTime.textContent = formatSyncTime(state.lastUpdated);
        
        if (state.updates.length === 0) {
            showState('empty');
        } else {
            showState('timeline');
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        elements.errorMessage.textContent = error.message;
        showState('error');
    } finally {
        elements.refreshBtn.classList.remove('refreshing');
        elements.refreshBtn.disabled = false;
    }
}

// Splits the XML HTML content into individual update chunks
function processFeedEntries() {
    state.updates = [];
    
    state.rawEntries.forEach(entry => {
        const parsedUpdates = splitEntryIntoUpdates(entry);
        state.updates.push(...parsedUpdates);
    });
    
    // Sort updates chronologically (newest first) based on updated field
    state.updates.sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

function splitEntryIntoUpdates(entry) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(entry.content, 'text/html');
    const updates = [];
    
    // Release notes feeds group updates inside <h3> tags (e.g. <h3>Feature</h3>, <h3>Change</h3>)
    const h3Elements = doc.querySelectorAll('h3');
    
    if (h3Elements.length === 0) {
        // If there are no H3 elements, wrap the entire entry as an Announcement
        updates.push({
            id: entry.id,
            rawId: entry.id,
            date: entry.title,
            updated: entry.updated,
            link: entry.link,
            type: 'Announcement',
            contentHtml: entry.content
        });
        return updates;
    }
    
    h3Elements.forEach((h3, index) => {
        const rawType = h3.textContent.trim();
        const normalizedType = normalizeCategory(rawType);
        
        // Gather sibling elements up to the next H3 tag
        let contentHtml = '';
        let sibling = h3.nextSibling;
        while (sibling && sibling.tagName !== 'H3') {
            if (sibling.nodeType === Node.ELEMENT_NODE) {
                contentHtml += sibling.outerHTML;
            } else if (sibling.nodeType === Node.TEXT_NODE) {
                if (sibling.textContent.trim()) {
                    contentHtml += sibling.textContent;
                }
            }
            sibling = sibling.nextSibling;
        }
        
        updates.push({
            id: `${entry.id}-${index}`,
            rawId: entry.id,
            date: entry.title,
            updated: entry.updated,
            link: entry.link,
            type: normalizedType,
            rawType: rawType,
            contentHtml: contentHtml.trim()
        });
    });
    
    return updates;
}

// Maps arbitrary types to known system categories
function normalizeCategory(type) {
    const t = type.toLowerCase();
    if (t.includes('feature')) return 'Feature';
    if (t.includes('change')) return 'Change';
    if (t.includes('announcement') || t.includes('general availability') || t.includes('ga')) return 'Announcement';
    if (t.includes('issue') || t.includes('bug')) return 'Issue';
    if (t.includes('deprecation') || t.includes('deprecated') || t.includes('retired')) return 'Deprecation';
    return 'Announcement'; // fallback default
}

// ==========================================================================
// Dashboard Stats Counter
// ==========================================================================
function updateStats() {
    const total = state.updates.length;
    const features = state.updates.filter(u => u.type === 'Feature').length;
    const changes = state.updates.filter(u => u.type === 'Change').length;
    const others = total - (features + changes);
    
    elements.statTotal.textContent = total;
    elements.statFeatures.textContent = features;
    elements.statChanges.textContent = changes;
    elements.statOthers.textContent = others;
}

// ==========================================================================
// Timeline Filtering & Rendering
// ==========================================================================
function applyFilters() {
    const query = state.searchQuery.toLowerCase();
    
    state.filteredUpdates = state.updates.filter(update => {
        // Category filtering
        if (state.currentFilter !== 'all' && update.type !== state.currentFilter) {
            return false;
        }
        
        // Search filtering
        if (query) {
            const dateMatch = update.date.toLowerCase().includes(query);
            const typeMatch = update.type.toLowerCase().includes(query);
            
            // Text content matching (stripping HTML tags first for clean matching)
            const textContent = stripHtml(update.contentHtml).toLowerCase();
            const contentMatch = textContent.includes(query);
            
            return dateMatch || typeMatch || contentMatch;
        }
        
        return true;
    });
    
    renderTimeline();
}

function renderTimeline() {
    elements.timelineContainer.innerHTML = '';
    
    if (state.filteredUpdates.length === 0) {
        showState('empty');
        return;
    }
    
    showState('timeline');
    
    // Group updates by date for clean chronological layout
    const grouped = {};
    state.filteredUpdates.forEach(update => {
        if (!grouped[update.date]) {
            grouped[update.date] = [];
        }
        grouped[update.date].push(update);
    });
    
    // Render grouped dates
    Object.keys(grouped).forEach(date => {
        const updatesList = grouped[date];
        
        const dayGroup = document.createElement('div');
        dayGroup.className = 'day-group';
        
        // Formulate calendar visual card
        const parsedDate = new Date(updatesList[0].updated);
        const monthName = parsedDate.toLocaleString('en-US', { month: 'short' });
        const dayNum = parsedDate.getDate();
        
        dayGroup.innerHTML = `
            <div class="day-header">
                <div class="calendar-icon-wrapper">
                    <span class="cal-month">${monthName}</span>
                    <span class="cal-day">${dayNum}</span>
                </div>
                <div class="day-title-text">${date}</div>
            </div>
            <div class="day-updates"></div>
        `;
        
        const updatesContainer = dayGroup.querySelector('.day-updates');
        
        updatesList.forEach(update => {
            const card = document.createElement('div');
            card.className = 'update-card';
            if (state.selectedUpdate && state.selectedUpdate.id === update.id) {
                card.classList.add('selected');
            }
            
            card.innerHTML = `
                <div class="card-selector">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <div class="card-meta">
                    <span class="category-badge badge-${update.type.toLowerCase()}">${update.type}</span>
                    <button class="card-copy-btn" title="Copy Release Note to Clipboard">
                        <svg class="copy-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <svg class="check-card-icon hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                    <span class="tweet-action-indicator">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        ${state.selectedUpdate && state.selectedUpdate.id === update.id ? 'Selected' : 'Select to Tweet'}
                    </span>
                </div>
                <div class="update-body">${update.contentHtml}</div>
            `;
            
            // Card Copy Button Handler
            const copyBtn = card.querySelector('.card-copy-btn');
            copyBtn.addEventListener('click', async (event) => {
                event.stopPropagation(); // Prevent toggling selection
                
                const plainText = stripHtml(update.contentHtml).replace(/\s+/g, ' ').trim();
                const copyText = `BigQuery ${update.type} (${update.date}):\n\n${plainText}\n\nLink: ${update.link}`;
                
                try {
                    await navigator.clipboard.writeText(copyText);
                    
                    // Visual feedback
                    copyBtn.classList.add('copied');
                    copyBtn.querySelector('.copy-card-icon').classList.add('hidden');
                    copyBtn.querySelector('.check-card-icon').classList.remove('hidden');
                    
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.querySelector('.copy-card-icon').classList.remove('hidden');
                        copyBtn.querySelector('.check-card-icon').classList.add('hidden');
                    }, 2000);
                } catch (err) {
                    console.error('Clipboard copy failed:', err);
                }
            });
            
            // Selecting card sets up Composer
            card.addEventListener('click', (e) => {
                // Prevent trigger if clicking on anchors or copy button
                if (e.target.tagName === 'A' || e.target.closest('a') || e.target.closest('.card-copy-btn')) {
                    return;
                }
                selectUpdateForTweet(update, card);
            });
            
            updatesContainer.appendChild(card);
        });
        
        elements.timelineContainer.appendChild(dayGroup);
    });
}

function selectUpdateForTweet(update, cardElement) {
    // Clear previous selection
    document.querySelectorAll('.update-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.tweet-action-indicator').forEach(el => {
        el.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Select to Tweet
        `;
    });
    
    // Toggle off if clicking the same selected card
    if (state.selectedUpdate && state.selectedUpdate.id === update.id) {
        state.selectedUpdate = null;
        elements.composerEmptyState.classList.remove('hidden');
        elements.composerActiveState.classList.add('hidden');
        elements.mobileComposerTrigger.classList.add('hidden');
        return;
    }
    
    // Set active selection
    state.selectedUpdate = update;
    cardElement.classList.add('selected');
    
    const indicator = cardElement.querySelector('.tweet-action-indicator');
    indicator.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        Selected
    `;
    
    // Show Composer fields
    elements.composerEmptyState.classList.add('hidden');
    elements.composerActiveState.classList.remove('hidden');
    
    // Mockup Date
    elements.mockupTimestamp.textContent = formatMockupTime(new Date());
    
    // Populate composition text
    updateComposerText();
    
    // Manage mobile drawer trigger
    if (window.innerWidth <= 992) {
        elements.mobileComposerTrigger.classList.remove('hidden');
        elements.mobileBadgeDot.classList.remove('hidden');
        // Let's slide open the drawer directly for optimal user feedback!
        elements.composerSidebar.classList.add('open');
    }
}

// ==========================================================================
// Twitter / X Composer Functions
// ==========================================================================
function updateComposerText() {
    if (!state.selectedUpdate) return;
    
    const text = generateTweetText(state.selectedUpdate, state.includeLink);
    elements.tweetTextarea.value = text;
    updateCharCounter(text);
}

function generateTweetText(update, includeLink) {
    const type = update.type;
    const date = update.date;
    
    // Flatten list tags to clean bulletin symbols
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = update.contentHtml;
    
    // Clean bullet list elements for clean line breaks
    tempDiv.querySelectorAll('li').forEach(li => {
        li.textContent = `• ${li.textContent.trim()}\n`;
    });
    
    let plainContent = tempDiv.textContent || tempDiv.innerText || '';
    // Normalize newlines
    plainContent = plainContent.replace(/\n\s*\n/g, '\n').trim();
    
    const prefix = `BigQuery ${type} (${date}):\n\n`;
    const suffix = includeLink ? `\n\n${update.link}` : '';
    
    // X/Twitter limit is 280 characters
    const targetLimit = 280;
    const reservedLen = prefix.length + suffix.length;
    const allowedSnippetLen = targetLimit - reservedLen;
    
    let snippet = plainContent;
    if (plainContent.length > allowedSnippetLen) {
        // Truncate at allowed limit, making space for '...'
        snippet = plainContent.substring(0, allowedSnippetLen - 3) + '...';
    }
    
    return `${prefix}${snippet}${suffix}`;
}

function updateCharCounter(text) {
    const len = text.length;
    elements.charCounter.textContent = `${len} / 280`;
    
    elements.charCounter.className = 'char-counter';
    if (len > 280) {
        elements.charCounter.classList.add('danger');
    } else if (len > 255) {
        elements.charCounter.classList.add('warning');
    }
}

async function copyTweetToClipboard() {
    const text = elements.tweetTextarea.value;
    try {
        await navigator.clipboard.writeText(text);
        
        // Show success animation state
        elements.copyTweetBtn.classList.add('success');
        elements.copyBtnText.textContent = 'Copied!';
        elements.copyTweetBtn.querySelector('.copy-icon').classList.add('hidden');
        elements.copyTweetBtn.querySelector('.check-icon').classList.remove('hidden');
        
        setTimeout(() => {
            elements.copyTweetBtn.classList.remove('success');
            elements.copyBtnText.textContent = 'Copy Post Text';
            elements.copyTweetBtn.querySelector('.copy-icon').classList.remove('hidden');
            elements.copyTweetBtn.querySelector('.check-icon').classList.add('hidden');
        }, 2000);
    } catch (err) {
        console.error('Clipboard copy failed:', err);
        alert('Could not copy to clipboard automatically. Please select text manually inside the composer.');
    }
}

function openXIntent() {
    const text = elements.tweetTextarea.value;
    const encodedText = encodeURIComponent(text);
    const url = `https://twitter.com/intent/tweet?text=${encodedText}`;
    window.open(url, '_blank', 'noopener,noreferrer');
}

function toggleComposerDrawer() {
    elements.composerSidebar.classList.remove('open');
}

// ==========================================================================
// Helper Utilities
// ==========================================================================
function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function formatSyncTime(date) {
    if (!date) return 'Never';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatMockupTime(date) {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    return `${formattedHours}:${minutes} ${ampm} · ${month} ${day}, ${year}`;
}

function resetFilters() {
    elements.searchInput.value = '';
    state.searchQuery = '';
    state.currentFilter = 'all';
    
    elements.filterBtns.forEach(btn => {
        if (btn.dataset.filter === 'all') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    applyFilters();
}

function showState(mode) {
    elements.loaderState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
    elements.timelineContainer.classList.add('hidden');
    
    if (mode === 'loading') {
        elements.loaderState.classList.remove('hidden');
    } else if (mode === 'error') {
        elements.errorState.classList.remove('hidden');
    } else if (mode === 'empty') {
        elements.emptyState.classList.remove('hidden');
    } else if (mode === 'timeline') {
        elements.timelineContainer.classList.remove('hidden');
    }
}

function exportToCSV() {
    if (state.filteredUpdates.length === 0) {
        alert("No release notes found to export.");
        return;
    }
    
    const csvRows = [];
    // Header Row
    csvRows.push(['Date', 'Category', 'Description', 'Link'].map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    
    // Data Rows
    state.filteredUpdates.forEach(update => {
        const date = update.date;
        const category = update.type;
        const text = stripHtml(update.contentHtml).replace(/\s+/g, ' ').trim();
        const link = update.link;
        
        const row = [date, category, text, link].map(field => `"${field.replace(/"/g, '""')}"`);
        csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Formulate file name with date stamp
    const datestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `bigquery_release_notes_${datestamp}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
