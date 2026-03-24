// --- AUTH LOGIC ---
function mockGoogleLogin() {
    document.getElementById('authLoader').style.display = 'block';
    setTimeout(() => {
        sessionStorage.setItem("ey_auth_user", "Om@ey.com");
        checkAuth();
    }, 1200);
}

function logout() {
    sessionStorage.removeItem("ey_auth_user");
    checkAuth();
}

function checkAuth() {
    const user = sessionStorage.getItem("ey_auth_user");
    if(user) {
        document.getElementById('viewAuth').style.display = 'none';
        document.getElementById('viewApp').style.display = 'flex';
        document.getElementById('userNameDisplay').innerText = user;
        document.body.classList.remove('auth-mode');
        // Initial Fetch
        fetchPending();
        // Init Complex Charts
        setTimeout(initCharts, 300);
    } else {
        document.getElementById('viewAuth').style.display = 'flex';
        document.getElementById('viewApp').style.display = 'none';
        document.getElementById('authLoader').style.display = 'none';
        document.body.classList.add('auth-mode');
    }
}

window.onload = checkAuth;


// --- NAVIGATION / VIEWS ---
function switchTab(tabId, element) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    
    // Remove active class from nav
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Show selected view
    document.getElementById(`tab-${tabId}`).style.display = 'block';
    
    // Add active if called from click
    if(element) element.classList.add('active');
    
    if(tabId === 'hitl') fetchPending();
    if(tabId === 'risk') {
        // Redraw canvas if it exists
        if(lastPolicyContext && !ragAnimId) initRAGCanvas();
    }
}

let currentMode = 'text';
function switchInputMode(mode) {
    currentMode = mode;
    if (mode === 'text') {
        document.getElementById('tabTextBtn').classList.add('active');
        document.getElementById('tabPdfBtn').classList.remove('active');
        document.getElementById('applicantData').style.display = 'block';
        document.getElementById('pdfUploadContainer').style.display = 'none';
    } else {
        document.getElementById('tabPdfBtn').classList.add('active');
        document.getElementById('tabTextBtn').classList.remove('active');
        document.getElementById('pdfUploadContainer').style.display = 'block';
        document.getElementById('applicantData').style.display = 'none';
    }
}

// --- TERMINAL SIMULATION ---
const agentLogs = [
    { config: { stage: "ws-extract", msg: "Extraction Phase" }, logs: [
        "<span class='term-action'>-> Routing payload to PyMuPDF Extractor...</span>",
        "<span class='term-agent'>[Extraction_Agent]</span> <span class='term-action'>Parsing financial semantics...</span>",
        "<span class='term-agent'>[Extraction_Agent]</span> <span class='term-success'>Identified critical node bounds.</span>"
    ]},
    { config: { stage: "ws-policy", msg: "Policy Retrieval" }, logs: [
        "<span class='term-action'>-> Connecting to FAISS Vector DB...</span>",
        "<span class='term-agent'>[Retrieval_Agent]</span> <span class='term-action'>Converting metrics to dense float32 tensors.</span>",
        "<span class='term-agent'>[Retrieval_Agent]</span> <span class='term-success'>3 nearest policy clusters retrieved.</span>"
    ]},
    { config: { stage: "ws-risk", msg: "Critic Analysis" }, logs: [
        "<span class='term-action'>-> Instantiating Llama-3 70B Critic Protocol...</span>",
        "<span class='term-agent'>[Critic_Agent]</span> <span class='term-action'>Evaluating DTI & Risk against strict policy text.</span>"
    ]},
    { config: { stage: "ws-report", msg: "Reporting" }, logs: [
        "<span class='term-action'>-> Invoking formatting hooks...</span>",
        "<span class='term-agent'>[Report_Agent]</span> <span class='term-action'>Generating unified Risk Output.</span>",
        "<span class='term-success'>[System] Pipeline Terminated. Payload Ready.</span>"
    ]}
];

let termLogQueue = [];
let currentTermInt = null;

function renderNextTermLine() {
    if (termLogQueue.length === 0) return;
    const lineHtml = termLogQueue.shift();
    const termBody = document.getElementById('terminalBody');
    const div = document.createElement('div');
    div.className = 'term-line';
    div.innerHTML = lineHtml;
    termBody.appendChild(div);
    termBody.scrollTop = termBody.scrollHeight;
}

function resetWorkflowUI() {
    document.querySelectorAll('.workflow-stage').forEach(el => {
        el.classList.remove('active');
        el.querySelector('.ws-bar').style.width = '0%';
        const badge = el.querySelector('.ws-badge');
        badge.className = 'ws-badge'; badge.textContent = 'Idle';
    });
    document.getElementById('terminalBody').innerHTML = '';
    
    // Reset Risk Panel
    document.getElementById('decisionBadge').className = 'big-status status-Manual';
    document.getElementById('decisionBadge').innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Pending';
    document.getElementById('markdownReport').innerHTML = '';
}

function setWorkflowStageState(idx, isFinal = false) {
    document.querySelectorAll('.workflow-stage').forEach(el => el.classList.remove('active'));
    
    if(idx < agentLogs.length) {
        const stageId = agentLogs[idx].config.stage;
        const el = document.getElementById(stageId);
        el.classList.add('active');
        el.querySelector('.ws-badge').className = 'ws-badge processing';
        el.querySelector('.ws-badge').textContent = 'Processing';
        el.querySelector('.ws-bar').style.width = '100%';
        
        // Push terminal lines
        agentLogs[idx].logs.forEach(l => termLogQueue.push(l));
    }
    
    if (isFinal) {
        document.querySelectorAll('.workflow-stage').forEach(el => {
            el.classList.remove('active');
            el.querySelector('.ws-badge').className = 'ws-badge done';
            el.querySelector('.ws-badge').textContent = 'Done';
        });
    }
}

// --- CORE ANALYSIS FUNCTION ---
let activeThreadId = null;
let lastPolicyContext = "";

async function runAnalysis() {
    const btn = document.getElementById('analyzeBtn');
    document.getElementById('manualReviewMsg').style.display = 'none';
    
    btn.disabled = true;
    btn.innerHTML = 'Orchestrating <i class="fa-solid fa-circle-notch fa-spin ml-1"></i>';
    
    resetWorkflowUI();
    
    // Jump to Agent Monitor to show live workflow
    switchTab('agent-monitor', document.querySelectorAll('.nav-item')[1]);
    
    termLogQueue = [];
    currentTermInt = setInterval(renderNextTermLine, 400);
    
    let step = 0;
    const interval = setInterval(() => {
        if(step < agentLogs.length) {
            setWorkflowStageState(step);
            step++;
        }
    }, 1500);

    const t0 = performance.now();

    try {
        let response;
        if (currentMode === 'text') {
            const rawText = document.getElementById('applicantData').value;
            response = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw_text: rawText })
            });
        } else {
            const fileInput = document.getElementById('pdfFile');
            if (fileInput.files.length === 0) throw new Error("Please select a PDF file.");
            const formData = new FormData();
            formData.append("file", fileInput.files[0]);
            response = await fetch('/analyze_pdf', { method: 'POST', body: formData });
        }
        
        const t1 = performance.now();
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Server Error");
        }
        
        const data = await response.json();
        
        // Resolve UI Timers
        clearInterval(interval);
        setTimeout(() => clearInterval(currentTermInt), 2000); // let terminal drain
        setWorkflowStageState(agentLogs.length, true);
        
        // Handle Logic Guards
        if (data.status === "extraction_review") {
            document.getElementById('extractionOverlay').style.display = 'flex';
            document.getElementById('extractionJson').value = JSON.stringify(data.extracted_data, null, 2);
            activeThreadId = data.thread_id;
            return;
        }

        if (data.status === "manual_review") {
            switchTab('overview', document.querySelectorAll('.nav-item')[0]);
            document.getElementById('manualReviewMsg').style.display = 'block';
            return;
        }
        
        activeThreadId = data.thread_id;
        processFinalAnalysisPayload(data, t1 - t0);
        
        // Jump to Decision Risk tab contextually
        setTimeout(() => {
            switchTab('risk', document.getElementById('nav-risk'));
        }, 800);
        
    } catch (err) {
        clearInterval(interval);
        clearInterval(currentTermInt);
        alert("Pipeline Error: " + err.message);
        switchTab('overview', document.querySelectorAll('.nav-item')[0]);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Initialize Engine <i class="fa-solid fa-play ml-1"></i>';
    }
}

function processFinalAnalysisPayload(data, latencyMs) {
    // 1. Decision Badge
    let statusClass = "status-Manual";
    if (data.recommendation.toLowerCase().includes('approve')) statusClass = "status-Approve";
    if (data.recommendation.toLowerCase().includes('reject')) statusClass = "status-Reject";
    
    document.getElementById('decisionBadge').className = `big-status ${statusClass}`;
    document.getElementById('decisionBadge').textContent = data.recommendation;
    
    // 2. Report Markdown
    document.getElementById('markdownReport').innerHTML = marked.parse(data.report);
    
    // 3. Telemetry & KPI Math
    const latency = (latencyMs / 1000).toFixed(2);
    document.getElementById('kpi-latency').textContent = `${latency}s`;
    
    const inputLen = currentMode === 'text' ? document.getElementById('applicantData').value.length : 1500;
    const estTokens = Math.floor((inputLen + data.report.length) / 3.5) + 800;
    const estCost = "$" + (estTokens * (0.80 / 1000000)).toFixed(4);
    
    // 4. Update Risk Indicators
    const intentScore = data.malicious_intent_score || 0.0;
    document.getElementById('ri-intent-val').textContent = intentScore;
    const intentBar = document.getElementById('ri-intent-bar');
    intentBar.style.width = Math.max(10, intentScore * 100) + '%';
    if(intentScore > 0.5) { intentBar.className = 'ri-bar bg-red'; } else { intentBar.className = 'ri-bar bg-green'; }
    
    document.getElementById('ri-cost-val').textContent = `${estCost} / ${estTokens}`;
    
    // 5. Save RAG Context
    lastPolicyContext = data.policy_context || "";
}

// --- PRE-FLIGHT GUARD FIX ---
async function submitExtractionFix() {
    try {
        const correctedData = JSON.parse(document.getElementById('extractionJson').value);
        const res = await fetch('/resume_extraction', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ thread_id: activeThreadId, corrected_data: correctedData })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Server Error");
        
        document.getElementById('extractionOverlay').style.display = 'none';
        processFinalAnalysisPayload(data, 1200);
        switchTab('risk', document.getElementById('nav-risk'));
        
    } catch (err) {
        alert("Error Resuming: " + err.message);
    }
}

// --- HITL QUEUE ---
async function fetchPending() {
    const list = document.getElementById('pendingList');
    const historyList = document.getElementById('historyList');
    
    try {
        const res = await fetch('/pending');
        const data = await res.json();
        
        list.innerHTML = "";
        if (!data.pending || data.pending.length === 0) {
            list.innerHTML = "<p class='color-accent font-bold mt-1 text-center'><i class='fa-solid fa-mug-hot'></i> Zero pending applications.</p>";
        } else {
            data.pending.forEach(app => {
                const div = document.createElement('div');
                div.className = "hitl-card";
                div.innerHTML = `
                    <div>
                        <div class="hitl-name">${app.data?.name || "Unknown"}</div>
                        <div class="hitl-meta">Thread: ${app.thread_id.substring(0,8)}...</div>
                        <div class="hitl-flag"><i class="fa-solid fa-flag"></i> ${app.recommendation_reason}</div>
                    </div>
                    <button class="btn-primary" onclick='openModal(${JSON.stringify(app).replace(/'/g, "&apos;")})'>Review</button>
                `;
                list.appendChild(div);
            });
        }
        
        if(historyList) {
            historyList.innerHTML = "";
            if (!data.history || data.history.length === 0) {
                historyList.innerHTML = "<p class='text-mute text-center'>No review history found.</p>";
            } else {
                data.history.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                data.history.forEach(app => {
                    const div = document.createElement('div');
                    div.className = `history-card ${app.decision}`;
                    div.innerHTML = `
                        <div>
                            <div class="font-bold">${app.data?.name || "Unknown"}</div>
                            <div class="h-date">${app.timestamp}</div>
                        </div>
                        <div class="h-badge ${app.decision}">${app.decision}</div>
                    `;
                    historyList.appendChild(div);
                });
            }
        }
    } catch(e) {
        list.innerHTML = `<p class="color-warning">Error: ${e}</p>`;
    }
}

function openModal(app) {
    activeThreadId = app.thread_id;
    document.getElementById('modalContent').innerHTML = `
        <h4 class="mb-1 text-mute">AI Flag Reason:</h4>
        <p class="mb-2" style="font-size:1.1rem; line-height:1.5;">${app.analysis}</p>
        <h4 class="mb-1 text-mute">Extracted State Array:</h4>
        <pre class="font-mono" style="background:rgba(0,0,0,0.5); padding:1rem; border-radius:8px; color:var(--success); font-size:0.85rem;">${JSON.stringify(app.data, null, 2)}</pre>
    `;
    document.getElementById('reviewModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('reviewModal').style.display = 'none';
    activeThreadId = null;
}

async function submitDecision(decision) {
    if(!activeThreadId) return;
    document.getElementById('modalContent').innerHTML = `<p class="text-center font-bold color-warning mt-2 mb-2"><i class="fa-solid fa-spinner fa-spin"></i> Committing to memory...</p>`;
    try {
        const payload = { thread_id: activeThreadId, decision: decision };
        const res = await fetch('/resume', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        const data = await res.json();
        closeModal();
        alert(`Workflow Update Committed!\nFinal Status: ${data.recommendation}`);
        fetchPending(); 
    } catch(e) {
        alert("Error saving decision: " + e);
        closeModal();
    }
}

// --- POLICY BOT LOGIC ---
async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text) return;
    
    const chatHistory = document.getElementById('chatHistory');
    
    chatHistory.innerHTML += `<div class="chat-bubble user">${text}</div>`;
    input.value = "";
    
    const btn = document.getElementById('chatBtn');
    btn.disabled = true;
    
    try {
        const response = await fetch('/chat_policy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: text })
        });
        const data = await response.json();
        
        const markup = marked.parse(data.response);
        chatHistory.innerHTML += `<div class="chat-bubble bot">${markup}</div>`;
    } catch(e) {
        chatHistory.innerHTML += `<div class="chat-bubble bot" style="color:var(--danger)">Error: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}

// --- COMPLEX CHARTS LOGIC (CHART.JS) ---
let chartsInitialized = false;
function initCharts() {
    if(chartsInitialized) return;
    
    // Chart 1: Volume Area Chart
    const ctxVol = document.getElementById('volumeChart');
    if(ctxVol) {
        // Gradient fill
        const gradient = ctxVol.getContext('2d').createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0, 'rgba(255, 230, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 230, 0, 0.0)');

        new Chart(ctxVol, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Automated Approvals',
                    data: [120, 190, 150, 240, 210, 80, 100],
                    borderColor: '#FFE600',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#0a0e17',
                    pointBorderColor: '#FFE600',
                    pointBorderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'HITL Exceptions',
                    data: [12, 19, 15, 25, 22, 5, 8],
                    borderColor: '#ff1744',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#8b949e', font: { family: 'Inter' } } },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b949e' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b949e' } }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
    }

    // Chart 2: Radial/Doughnut Chart
    const ctxRad = document.getElementById('radialChart');
    if(ctxRad) {
        new Chart(ctxRad, {
            type: 'doughnut',
            data: {
                labels: ['< 2s (Fast)', '2s-5s (Norm)', '> 5s (Slow)'],
                datasets: [{
                    data: [65, 25, 10],
                    backgroundColor: [
                        'rgba(0, 230, 118, 0.8)',
                        'rgba(33, 150, 243, 0.8)',
                        'rgba(255, 179, 0, 0.8)'
                    ],
                    borderColor: '#0a0e17',
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#8b949e', font: { family: 'Inter' }, padding: 15, usePointStyle: true } }
                }
            }
        });
    }
    chartsInitialized = true;
}


// --- XAI CANVAS LOGIC (RAG VIZ) ---
let ragAnimId;
function initRAGCanvas() {
    const canvas = document.getElementById('ragCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let policyNodes = [];
    
    // Generate complex background noise vectors (ambient knowledge graph)
    const numBackgroundNodes = 25;
    for(let i=0; i<numBackgroundNodes; i++) {
        policyNodes.push({
            x: Math.random()*canvas.width,
            y: Math.random()*canvas.height,
            r: 2 + Math.random()*3,
            color: 'rgba(255, 255, 255, 0.15)',
            label: '',
            vx: (Math.random()-0.5)*0.3,
            vy: (Math.random()-0.5)*0.3,
            isBackground: true
        });
    }

    // Embed contextual highlighted vectors if policy was parsed
    if (lastPolicyContext) {
        const sections = lastPolicyContext.split("\n\n").map(s => s.trim()).filter(s => s.length > 5);
        sections.slice(0, 6).forEach((sec, index) => {
            const match = sec.match(/\[Section [\d\.]+\]/);
            let label = match ? match[0] : `Cluster ${index + 1}`;
            policyNodes.push({
                x: Math.random()*(canvas.width - 100) + 50,
                y: Math.random()*(canvas.height - 50) + 25,
                r: 6 + Math.random()*6,
                color: '#2196f3',
                label: label,
                vx: (Math.random()-0.5)*0.6,
                vy: (Math.random()-0.5)*0.6,
                isBackground: false
            });
        });
    }

    if (policyNodes.length === numBackgroundNodes) {
        // Fallback main nodes if empty context
        for(let i=0; i<4; i++) {
             policyNodes.push({ x: canvas.width*(0.2*i+0.2), y: canvas.height/2 + (Math.random()*40-20), r: 8, color: '#b388ff', label: "Latent ID_"+i, vx: (Math.random()-0.5)*0.8, vy: (Math.random()-0.5)*0.8, isBackground:false });
        }
    }

    // Input node is always at index 0 of the final array
    let nodes = [
        { x: canvas.width/2, y: canvas.height/2, r: 16, color: '#FFE600', label: "Target State", vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4, isBackground: false },
        ...policyNodes
    ];

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.textAlign = "left";
        ctx.font = "10px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillText("High-Dimensional RAG Sub-Space Projection", 10, 20);

        // Draw complex neural-net style mesh between background nodes
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 0.5;
        for(let i=1; i<nodes.length; i++) {
            for(let j=i+1; j<nodes.length; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if(dist < 80 && nodes[i].isBackground && nodes[j].isBackground) {
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.stroke();
                }
            }
        }

        // Draw primary connections from Center Applicant Node to Active Policy Nodes
        nodes.forEach((n, i) => {
            if (i !== 0 && !n.isBackground) {
                // Connection Line
                ctx.beginPath();
                ctx.moveTo(nodes[0].x, nodes[0].y);
                ctx.lineTo(n.x, n.y);
                ctx.strokeStyle = "rgba(255, 230, 0, 0.2)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                // Particle data flow animation
                const time = Date.now() / 800;
                // create 3 flowing particles per line for complexity
                for(let p=0; p<3; p++) {
                    const phase = (time + i + p*0.3) % 1; 
                    const flowX = nodes[0].x + (n.x - nodes[0].x) * phase;
                    const flowY = nodes[0].y + (n.y - nodes[0].y) * phase;
                    ctx.beginPath();
                    ctx.arc(flowX, flowY, 2, 0, Math.PI*2);
                    ctx.fillStyle = `rgba(33, 150, 243, ${1 - phase})`; // Fades out as it reaches dest
                    ctx.fill();
                }
            }
        });

        ctx.textAlign = "center";
        nodes.forEach((n) => {
            n.x += n.vx; n.y += n.vy;
            // Border collision bounce
            if (n.x < 15 || n.x > canvas.width - 15) n.vx *= -1;
            if (n.y < 15 || n.y > canvas.height - 15) n.vy *= -1;
            
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
            ctx.fillStyle = n.color;
            if(!n.isBackground) {
                ctx.shadowColor = n.color;
                ctx.shadowBlur = 10;
            } else {
                ctx.shadowBlur = 0;
            }
            ctx.fill();
            ctx.shadowBlur = 0; // reset
            
            if(n.label && !n.isBackground) {
                ctx.fillStyle = "rgba(255,255,255,0.9)";
                ctx.font = "bold 10px monospace";
                ctx.fillText(n.label, n.x, n.y + n.r + 14);
            }
        });

        ragAnimId = requestAnimationFrame(draw);
    }
    
    // ensure unique animation loop
    cancelAnimationFrame(ragAnimId);
    draw();
}
