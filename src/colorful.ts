interface adj_node {
    id: number;
    state: number;
    next: Set<adj_node>;
    next_ids: Set<number>
}

class adj_node {
    constructor(id:number) {
        this.id = id;
        this.state = 0;
        this.next = new Set();
        this.next_ids = new Set();
    }
}

interface ColorfulGrid {
    /** flat Float32 array that defines the underlying 2D mesh. */
    mesh: Float32Array;
    /** flat Uint32 array that defines per-vertex triangle id.  */
    ids: Uint32Array;
    /** flat Float32 array that defines per-vertex uvs for the lut table. */
    uvs: Float32Array;
    /** flat Float32 array that defines per-vertex uvs for the first adj
     * triangle. */
    adj_uvs_1: Float32Array;
    /** flat Float32 array that defines per-vertex uvs for the second adj
     * triangle. */
    adj_uvs_2: Float32Array;
    /** flat Float32 array that defines per-vertex uvs for the third adj
     * triangle. */
    adj_uvs_3: Float32Array;
    /** flat Uint8 array that defines per-vertex hovered state. */
    hovered: Uint8Array;

    /** used for the state shader program where points are used instead of
     * vertices.  */
    // cell_ids: Uint32Array;
    // cell_uvs: Float32Array;
    // cell_adj_uvs_1: Float32Array;
    // cell_adj_uvs_2: Float32Array;
    // cell_adj_uvs_3: Float32Array;
    // /** flat Float32 array that defines per-vertex wave color weight state. */
    // state_weights: Float32Array;
    // /** flat Float32 array that defines per-vertex wave color state. */
    // wcolor_dist: Float32Array;
    /** resolution of the grid. */
    side_length: number;
    /** adjacency map, per vertex id returns the list of the adjacent vertex
     * ids. */
    adj_map: number[][];
    /** adjacency graph, per node holds its id, state and adjacent nodes. */
    adj_graph: adj_node[];
    /** flat Uint8 array which defines the lut texture used to color each vertex
     *  by using its triangle id. */
    texture: Uint8Array;
    /** Uint32 view of the lut texture. */
    texture_u32view: Uint32Array;
    /** number of pixels of the square lut texture. */
    texture_size: number;
    /** number of vertices present in the 2D mesh. */
    vertex_count: number,
    triangle_count: number;
}

class ColorfulGrid {
    constructor(side_length:number, color=new Uint8Array([255,255,255,255])) {
        if (!Number.isInteger(side_length) || side_length < 1)
            throw `ColorfulGrid: side_length must be an integer greater than 1`;
        this.side_length = side_length;

        const num_triangles = 6*side_length**2;
        this.triangle_count = num_triangles;
        this.vertex_count = num_triangles * 3;

        this.adj_map = Array(num_triangles+1);
        this.mesh = new Float32Array(num_triangles*6);

        const _2_side = side_length * 2;
        const points: [x:number, y:number][][] = 
            Array.from({length:_2_side+1}, 
                () => Array.from({length:_2_side+1}, 
                    () => Array(2) as [x:number,y:number]
                )
            );
                
        let a=0, b=0;
        {
            const step = 1 / side_length,
                  sqrt_step = Math.sqrt(3)/2 * step;
            
            for (let a=0; a <= _2_side; ++a) {
                for (let b=0; b <= _2_side; ++b) {
                    const u = b - side_length,
                          v = a - side_length;

                    points[a][b][0] = (u - 0.5*v) * step;
                    points[a][b][1] = v * sqrt_step;
                }
            }
        }

        /** 
         * Offset to be applied to `a` and `b` during the construction of the
         *  hexagon mesh. Both parameters are used in the matrix of points that
         *  will define the mesh itself.
         * 
         * Each vertex lies on the point matrix defined by
         *  [b/_2l, 0.75 + (b/2 - a) * _2l] where 0 <= a,b <= 2*side_length,
         *      and _2l = side_length.
         * 
         * The hexagon is built starting from the center (depth=d=0) up to 
         *  d=side_length, one side at a time.
         * 
         * Each side consists of `2*d-1` triangles and, apart from `d=0`, each
         *  depth has two different triangle arrangements.
         * 
         * Those arrangements are [v1,v2,v3] and [v4,v5,v6] (at zero depth the
         *  first arrangement is used).
         * 
         * v1,v2,v3,v4,v5 and v6 where chosen carefully so that after
         *  constructing the last [v1,v2,v3] of the side there is no need to
         *  move the anchor point before building the next side; while, after
         *  each [v1,v2,v3] and [v4,v5,v6] pair, the anchor moves to v5.
         * 
         * The following datastructure, hovewer holds the information only for
         *  [v2,v3,v5] since v1=v4=[0,0] and v2=v6.
         */
        const side_vertex_order = [
            [[ 1, 0], [ 0,-1], [ 1, 1]],
            [[ 1, 1], [ 1, 0], [ 0, 1]],
            [[ 0, 1], [ 1, 1], [-1, 0]],

            [[ -1, 0], [ 0,1], [-1,-1]],
            
            [[-1,-1], [-1, 0], [ 0,-1]],
            [[ 0,-1], [-1,-1], [ 1, 0]]
        ] as [v2:[number,number],v3:[number,number],v5:[number,number]][];

        /** flat vertex coordinate index. */
        let v = 0;
        /** both a and b refer to the exact center of the point matrix. */
        b = a = side_length;

        let triangle_id = 0;
        /** d=depth starting from the center of the hexagon. */
        for (let d=0; d<side_length; ++d) {
            /** `2*d-1` is the number of triangles per side at depth d. */
            const pair_count = Math.floor((2*d+1) / 2),
                  last_layer = d === side_length-1,
                  triangle_count = 6*(2*d+1);
            /** s=current side, starting from the upper right, clock-wise. */
            for (let s=0; s<6; ++s) {
                const deltas = side_vertex_order[s],
                      next_layer_adj = 2*(3+s+6*d) + 1,
                      /** f(d,s) = 2*(3+s+6*d) + 1
                       * f(d-1,s) = f(d,s) - 12 */
                      prev_layer_adj = next_layer_adj - 12;
                
                for (let p=0; p<pair_count; ++p) {  
                    const delta_a = deltas[2][1],
                          delta_b = deltas[2][0];

                    const v1 = points[a][b],
                          v2 = points[a+deltas[0][1]][b+deltas[0][0]],
                          v3 = points[a+deltas[1][1]][b+deltas[1][0]],
                          v5 = points[a+delta_a][b+delta_b];
                    
                    this.mesh[v]   = v1[0];
                    this.mesh[v+1] = v1[1];
                    
                    this.mesh[v+2] = v2[0];
                    this.mesh[v+3] = v2[1];

                    this.mesh[v+4] = v3[0];
                    this.mesh[v+5] = v3[1];

                    const t1 = ++triangle_id;
                    if (s === 0 && p === 0)
                        this.adj_map[t1] =
                            [t1+1, t1+triangle_count-1, t1+next_layer_adj];
                    else
                        this.adj_map[t1] = [t1-1, t1+1, t1+next_layer_adj];
                    
                    this.mesh[v+6] = v1[0];
                    this.mesh[v+7] = v1[1];

                    this.mesh[v+8] = v5[0];
                    this.mesh[v+9] = v5[1];

                    this.mesh[v+10] = v2[0];
                    this.mesh[v+11] = v2[1];

                    const t2 = ++triangle_id;
                    this.adj_map[t2] = [t2-prev_layer_adj, t2-1, t2+1];

                    a = a + delta_a;
                    b = b + delta_b;
                    v = v+12;
                }

                /** last triangle for the side s at depth d. */
                const v1 = points[a][b],
                      v2 = points[a+deltas[0][1]][b+deltas[0][0]],
                      v3 = points[a+deltas[1][1]][b+deltas[1][0]];

                this.mesh[v]   = v1[0];
                this.mesh[v+1] = v1[1];

                this.mesh[v+2] = v2[0];
                this.mesh[v+3] = v2[1];

                this.mesh[v+4] = v3[0];
                this.mesh[v+5] = v3[1];                

                const t = ++triangle_id;
 
                if (s === 0)
                    if (d === 0)
                        this.adj_map[t] =
                            [t+1, t+triangle_count-1, t+next_layer_adj];
                    else
                        this.adj_map[t] = [t-1, t+1, t+next_layer_adj];
                else if (s !== 5)
                    this.adj_map[t] = [t-1, t+1];
                else
                    this.adj_map[t] = [t-triangle_count+1, t-1];

                if (!last_layer && s !== 0)
                    this.adj_map[t][2] = t+next_layer_adj;

                v = v+6;
            }

            /** when last (upper left) side is done, the last access point is
             *      [a=center-d, b=center].
             * a must be decreased once to move up to the next depth level. */
            --a;
        }
        
        const texture_size = Math.ceil(Math.sqrt(this.vertex_count));
        this.texture_size = texture_size;

        const nt6 = num_triangles * 6,
              nt3 = num_triangles * 3,
              nt2 = num_triangles * 2;

        this.ids = new Uint32Array(nt3);
        // this.cell_ids = new Uint32Array(num_triangles);
        this.uvs = new Float32Array(nt6);
        // this.cell_uvs = new Float32Array(nt2);
        this.hovered = new Uint8Array(nt3);
        this.hovered.fill(0);
        for (let i=0; i<num_triangles; ++i) {
            const id = i + 1,
                  base_i = i * 3,
                  base_u = i * 6,
                  base_uc = i * 2,
                  col = id % texture_size,
                  row = Math.floor(id / texture_size),
                  u = (col + 0.5) / texture_size,
                  v = (row + 0.5) / texture_size;

            // this.cell_ids[i] = id;

            this.ids[base_i] = id;
            this.ids[base_i+1] = id;
            this.ids[base_i+2] = id;

            // this.cell_uvs[base_uc] = u;
            // this.cell_uvs[base_uc+1] = v;

            this.uvs[base_u] = u;
            this.uvs[base_u+1] = v;
            this.uvs[base_u+2] = u;
            this.uvs[base_u+3] = v;
            this.uvs[base_u+4] = u;
            this.uvs[base_u+5] = v;
        }

        this.adj_uvs_1 = new Float32Array(nt6);
        // this.cell_adj_uvs_1 = new Float32Array(nt2);
        this.adj_uvs_2 = new Float32Array(nt6);
        // this.cell_adj_uvs_2 = new Float32Array(nt2);
        this.adj_uvs_3 = new Float32Array(nt6);
        // this.cell_adj_uvs_3 = new Float32Array(nt2);
        for (let i=0; i<num_triangles; ++i) {
            const id = i + 1,
                  base_i = i * 6,
                  base_ic = i * 2,
                  base_1 = this.adj_map[id][0] * 6,
                  base_2 = this.adj_map[id][1] * 6,
                  base_3 = this.adj_map[id][2] === undefined ? -1 : this.adj_map[id][2] * 6

            const u1 = this.uvs[base_1], v1 = this.uvs[base_1+1];
            // this.cell_adj_uvs_1[base_ic] = u1;
            // this.cell_adj_uvs_1[base_ic+1] = v1;

            this.adj_uvs_1[base_i] = u1;
            this.adj_uvs_1[base_i+1] = v1;
            this.adj_uvs_1[base_i+2] = u1;
            this.adj_uvs_1[base_i+3] = v1;
            this.adj_uvs_1[base_i+4] = u1;
            this.adj_uvs_1[base_i+5] = v1;

            const u2 = this.uvs[base_2], v2 = this.uvs[base_2+1];
            // this.cell_adj_uvs_2[base_ic] = u2;
            // this.cell_adj_uvs_2[base_ic+1] = v2;

            this.adj_uvs_2[base_i] = u2;
            this.adj_uvs_2[base_i+1] = v2;
            this.adj_uvs_2[base_i+2] = u2;
            this.adj_uvs_2[base_i+3] = v2;
            this.adj_uvs_2[base_i+4] = u2;
            this.adj_uvs_2[base_i+5] = v2;

            if (base_3 === -1) {
                // this.cell_adj_uvs_3[base_ic] = -1;
                // this.cell_adj_uvs_3[base_ic+1] = -1;

                this.adj_uvs_3[base_i] = -1;
                this.adj_uvs_3[base_i+1] = -1;
                this.adj_uvs_3[base_i+2] = -1;
                this.adj_uvs_3[base_i+3] = -1;
                this.adj_uvs_3[base_i+4] = -1;
                this.adj_uvs_3[base_i+5] = -1;
            }
            else {
                const u3 = this.uvs[base_3], v3 = this.uvs[base_3+1];
                // this.cell_adj_uvs_3[base_ic] = u3;
                // this.cell_adj_uvs_3[base_ic+1] = v3;

                this.adj_uvs_3[base_i] = u3;
                this.adj_uvs_3[base_i+1] = v3;
                this.adj_uvs_3[base_i+2] = u3;
                this.adj_uvs_3[base_i+3] = v3;
                this.adj_uvs_3[base_i+4] = u3;
                this.adj_uvs_3[base_i+5] = v3;
            }
        }
        
        const tex_length = texture_size * texture_size * 4;

        this.texture = new Uint8Array(tex_length);
        const u32view = new Uint32Array(this.texture.buffer);
        u32view.fill(pack_uint8(color));
        this.texture_u32view = u32view;

        // this.state_weights = new Float32Array(tex_length);
        // this.state_weights.fill(0.0);
        // this.wcolor_dist = new Float32Array(tex_length);
        // this.wcolor_dist.fill(0.0);

        this.adj_graph = Array(num_triangles+1);
        for (let id=1; id<this.adj_map.length; ++id) {
            const node = new adj_node(id);
            this.adj_graph[id] = node;
            const adj_ids = this.adj_map[id];
            for (let j=0; j<adj_ids.length; ++j) {
                const nid = adj_ids[j];
                if (nid > id)
                    break;
                const next_node = this.adj_graph[nid];
                node.next.add(next_node);
                node.next_ids.add(nid);
                next_node.next.add(node);
                next_node.next_ids.add(id);
            }
        }
    }

    
}