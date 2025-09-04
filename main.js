// main.js
const video = document.getElementById('video');
// Removed file input (header removed)
const frame = document.getElementById('frame');
const canvas = document.getElementById('probe');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Downsample target to keep it fast
const TARGET_W = 32;
const TARGET_H = 18;
canvas.width = TARGET_W;
canvas.height = TARGET_H;

function clamp255(x) { return Math.max(0, Math.min(255, x|0)); }

// Simple average color with slight saturation boost
function getAverageColorRGBA() {
	// Draw current frame scaled down
	ctx.drawImage(video, 0, 0, TARGET_W, TARGET_H);
	const { data } = ctx.getImageData(0, 0, TARGET_W, TARGET_H);

	let r = 0, g = 0, b = 0, c = 0;
	// Sample every other pixel for speed
	const stride = 4 * 2; // rgba * step
	for (let i = 0; i < data.length; i += stride) {
		const A = data[i + 3];
		if (A < 16) continue;
		r += data[i];
		g += data[i + 1];
		b += data[i + 2];
		c++;
	}
	if (!c) return 'rgba(0,0,0,0.45)';

	r /= c; g /= c; b /= c;

	// Boost saturation a touch to avoid washed-out glow
	const avg = (r + g + b) / 3;
	const boost = 1.12;
	r = clamp255(avg + (r - avg) * boost);
	g = clamp255(avg + (g - avg) * boost);
	b = clamp255(avg + (b - avg) * boost);

	// Subtle alpha so glow blends
	return `rgba(${r|0}, ${g|0}, ${b|0}, 0.55)`;
}

function setGlow(color) {
	frame.style.setProperty('--glow', color);
	document.documentElement.style.setProperty('--glow', color);
}

// Use requestVideoFrameCallback when available
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

let lastUpdate = 0;
const maxFPS = 15;
const minInterval = 1000 / maxFPS;

function updateGlow(ts) {
	if (video.readyState < 2 || video.paused) return;
	if (ts - lastUpdate >= minInterval) {
		setGlow(getAverageColorRGBA());
		lastUpdate = ts;
	}
}

function startLoop() {
	if (hasRVFC) {
		const tick = () => {
			video.requestVideoFrameCallback((now /*, meta */) => {
				updateGlow(now);
				if (!video.paused && !video.ended) tick();
			});
		};
		tick();
	} else {
		let rafId;
		const loop = () => {
			if (!video.paused && !video.ended) {
				updateGlow(performance.now());
				rafId = requestAnimationFrame(loop);
			}
		};
		video.addEventListener('pause', () => cancelAnimationFrame(rafId));
		video.addEventListener('ended', () => cancelAnimationFrame(rafId));
		loop();
	}
}

// Drag & drop support
function loadFile(file) {
	if (!file) return;
	const url = URL.createObjectURL(file);
	video.src = url;
	if (dropHint) dropHint.style.display = 'none';
	video.play().catch(() => {});
}

const dropHint = document.getElementById('dropHint');

function hideHint() { if (dropHint) dropHint.style.display = 'none'; }
function showHint() { if (dropHint) dropHint.style.display = ''; }

function hasVideoItem(dataTransfer) {
	if (!dataTransfer) return false;
	// Prefer items (more accurate MIME)
	if (dataTransfer.items && dataTransfer.items.length) {
		for (const it of dataTransfer.items) if (it.kind === 'file' && it.type.startsWith('video/')) return true;
		return false;
	}
	// Fallback to files/types
	if (dataTransfer.files && dataTransfer.files.length) return dataTransfer.files[0].type.startsWith('video/');
	if (dataTransfer.types && dataTransfer.types.includes && dataTransfer.types.includes('Files')) return true;
	return false;
}

function setDragState(active, valid) {
	if (active && valid) {
		frame.classList.add('dragging');
		if (dropHint) dropHint.textContent = 'Release to drop video';
	} else {
		frame.classList.remove('dragging');
		if (dropHint) dropHint.textContent = 'Drag & drop a video here';
	}
}

// Replace existing drag listeners with these:
['dragenter', 'dragover'].forEach(evt => {
	frame.addEventListener(evt, (e) => {
		e.preventDefault();
		e.stopPropagation();
		const valid = hasVideoItem(e.dataTransfer);
		setDragState(true, valid);
		// Tell the browser this is a copy drop
		if (valid) e.dataTransfer.dropEffect = 'copy';
	});
});

['dragleave', 'dragend'].forEach(evt => {
	frame.addEventListener(evt, (e) => {
		e.preventDefault();
		e.stopPropagation();
		setDragState(false, false);
	});
});

frame.addEventListener('drop', (e) => {
	e.preventDefault();
	e.stopPropagation();
	setDragState(false, false);
	const dt = e.dataTransfer;
	if (!dt) return;

	if (dt.items && dt.items.length) {
		for (const item of dt.items) {
			if (item.kind === 'file') {
				const file = item.getAsFile();
				if (file && file.type.startsWith('video/')) {
					loadFile(file);
					break;
				}
			}
		}
	} else if (dt.files && dt.files.length) {
		const file = dt.files[0];
		if (file && file.type.startsWith('video/')) loadFile(file);
	}
});

video.addEventListener('loadeddata', () => {
	setGlow(getAverageColorRGBA());
	hideHint();
});

video.addEventListener('play', () => {
	startLoop();
	hideHint();
});

video.addEventListener('emptied', () => {
	showHint();
});
video.addEventListener('error', () => {
	showHint();
});