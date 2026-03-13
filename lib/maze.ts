export type Cell = '#' | ' ' | 'S' | 'E';

export function generateMaze(h: number = 21, w: number = 21): Cell[][] {
  if (h % 2 === 0) h += 1;
  if (w % 2 === 0) w += 1;

  const maze: Cell[][] = Array.from({ length: h }, () => Array(w).fill('#'));
  const stack: [number, number][] = [[1, 1]];
  maze[1][1] = ' ';

  const dirs: [number, number][] = [[0, 2], [0, -2], [2, 0], [-2, 0]];

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const neighbors: [number, number, number, number][] = [];

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 1 && nr < h - 1 && nc >= 1 && nc < w - 1 && maze[nr][nc] === '#') {
        neighbors.push([nr, nc, dr, dc]);
      }
    }

    if (neighbors.length > 0) {
      const [nr, nc, dr, dc] = neighbors[Math.floor(Math.random() * neighbors.length)];
      maze[r + dr / 2][c + dc / 2] = ' ';
      maze[nr][nc] = ' ';
      stack.push([nr, nc]);
    } else {
      stack.pop();
    }
  }

  maze[1][1] = 'S';
  maze[h - 2][w - 2] = 'E';
  return maze;
}

export function findSE(maze: Cell[][]): { start: [number, number]; end: [number, number] } {
  let start: [number, number] = [1, 1];
  let end: [number, number] = [maze.length - 2, maze[0].length - 2];

  for (let r = 0; r < maze.length; r++) {
    for (let c = 0; c < maze[0].length; c++) {
      if (maze[r][c] === 'S') start = [r, c];
      if (maze[r][c] === 'E') end = [r, c];
    }
  }
  return { start, end };
}
