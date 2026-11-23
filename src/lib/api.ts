let userTokenMemory: string | null = null;
let adminTokenMemory: string | null = null;

export function setUserToken(token: string | null) {
  userTokenMemory = token;
}

export function setAdminToken(token: string | null) {
  adminTokenMemory = token;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit & { authMode?: 'user' | 'admin' | 'none' } = {}
): Promise<T> {
  const { authMode = 'user', headers, ...rest } = options;
  const reqHeaders = new Headers(headers);
  reqHeaders.set('X-Requested-With', 'XMLHttpRequest');
  if (rest.body && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  if (authMode === 'user' && userTokenMemory) {
    reqHeaders.set('Authorization', `Bearer ${userTokenMemory}`);
  } else if (authMode === 'admin' && adminTokenMemory) {
    reqHeaders.set('Authorization', `Bearer ${adminTokenMemory}`);
  }

  const res = await fetch(url, {
    ...rest,
    headers: reqHeaders,
    credentials: 'include',
  });

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Unexpected server response' };
  }

  if (!res.ok) {
    const errObj = data as { error?: string; blocked?: boolean; blockedUntil?: number; remainingMs?: number };
    const err = new Error(errObj.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      blocked?: boolean;
      blockedUntil?: number;
      remainingMs?: number;
    };
    err.status = res.status;
    err.blocked = errObj.blocked;
    err.blockedUntil = errObj.blockedUntil;
    err.remainingMs = errObj.remainingMs;
    throw err;
  }

  return data as T;
}

export function compressImageFromGallery(
  file: File,
  maxDimension = 720,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file from your gallery.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
