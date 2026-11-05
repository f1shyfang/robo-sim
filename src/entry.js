if (location.pathname.replace(/\/$/, '') === '/hanoi/compare') {
  await import('./hanoi-compare.js');
} else if (location.pathname.replace(/\/$/, '') === '/hanoi') {
  await import('./hanoi.js');
} else if (location.pathname.replace(/\/$/, '') === '/compare') {
  await import('./compare.js');
} else {
  await import('./main.js');
}
