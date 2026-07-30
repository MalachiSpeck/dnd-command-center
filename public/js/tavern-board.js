// public/js/tavern-board.js

async function renderTavernBoard() {
    const container = document.getElementById('campfire-tavern-board-root');
    if (!container) return;

    const posts = await window.offlineStore.getAll('tavernPosts');
    
    // Sort posts by posted_at or id descending
    posts.sort((a,b) => {
        const timeA = new Date(a.posted_at || 0).getTime();
        const timeB = new Date(b.posted_at || 0).getTime();
        return timeB - timeA;
    });

    if (posts.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px; font-style:italic; color:var(--text-muted); font-size:0.8rem;">No messages on the notice board yet...</div>`;
        return;
    }

    let html = '<div class="tavern-board-container">';
    posts.forEach(post => {
        const isDecree = post.author_type === 'npc' || post.style === 'official_decree';
        const cardClass = isDecree ? 'tavern-post-card official_decree' : `tavern-post-card ${post.style || ''}`;
        
        let repliesHtml = '';
        if (post.replies && post.replies.length > 0) {
            repliesHtml = '<div class="tavern-replies-section">';
            post.replies.forEach(rep => {
                repliesHtml += `
                    <div class="tavern-reply-item">
                        <div class="tavern-reply-author">
                            ${rep.author_name} 
                            <span class="tavern-reply-meta">${new Date(rep.posted_at).toLocaleDateString()}</span>
                        </div>
                        <div class="tavern-reply-body">${rep.content}</div>
                    </div>
                `;
            });
            repliesHtml += '</div>';
        }

        html += `
            <div class="${cardClass}" id="post-card-${post.id}">
                <div class="tavern-post-header">
                    <span class="tavern-post-author">${post.author_display || post.author_name}</span>
                    <span class="tavern-post-meta">${new Date(post.posted_at).toLocaleDateString()}</span>
                </div>
                <div class="tavern-post-content">${post.content}</div>
                
                ${repliesHtml}

                <form class="tavern-reply-form" onsubmit="submitTavernReply(event, '${post.id}')">
                    <input type="text" class="tavern-reply-input" placeholder="Whisper a reply..." required>
                    <button type="submit" class="tavern-reply-btn">Reply</button>
                </form>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

async function postNewTavernMessage() {
    const textEl = document.getElementById('campfire-tavern-new-post-input');
    if (!textEl || !textEl.value.trim()) return;

    const content = textEl.value.trim();
    const styleSelect = document.getElementById('campfire-tavern-style-select');
    const style = styleSelect ? styleSelect.value : 'handwritten';

    const newPost = {
        id: `post_${Date.now()}_${charId}`,
        author_type: 'player',
        author_id: charId,
        author_name: character.name || 'Adventurer',
        author_display: `${character.name || 'Adventurer'} (${character.class || 'Hero'})`,
        posted_at: new Date().toISOString(),
        content: content,
        style: style,
        pinned: false,
        replies: []
    };

    // Save locally in pending queue + cache store
    await window.offlineStore.addPendingChange({
        type: 'tavern_post',
        ...newPost,
        timestamp: Date.now()
    });
    await window.offlineStore.put('tavernPosts', newPost);

    textEl.value = '';
    renderTavernBoard();

    // Trigger sync immediately in background if possible
    if (window.syncEngineV2) {
        window.syncEngineV2.sync().then(renderTavernBoard);
    }
}

async function submitTavernReply(event, postId) {
    event.preventDefault();
    const form = event.target;
    const input = form.querySelector('.tavern-reply-input');
    if (!input || !input.value.trim()) return;

    const replyText = input.value.trim();
    const post = await window.offlineStore.get('tavernPosts', postId);
    if (!post) return;

    const reply = {
        author_id: charId,
        author_name: character.name || 'Adventurer',
        content: replyText,
        posted_at: new Date().toISOString()
    };

    post.replies = post.replies || [];
    post.replies.push(reply);

    // Save and queue change
    await window.offlineStore.put('tavernPosts', post);
    await window.offlineStore.addPendingChange({
        type: 'character_edit',
        field: 'tavern_post_reply',
        postId: postId,
        reply: reply,
        timestamp: Date.now()
    });

    input.value = '';
    renderTavernBoard();

    if (window.syncEngineV2) {
        window.syncEngineV2.sync().then(renderTavernBoard);
    }
}
