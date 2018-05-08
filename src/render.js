(function(exports) {

exports.MapRenderer = Renderer;

var objects_atlas = {
	"width":86,
	"height":127,
	"sprites": [
		{"x":1,"y":91,"width":18,"height":18},
		{"x":20,"y":91,"width":18,"height":18},
		{"x":46,"y":1,"width":18,"height":18},
		{"x":46,"y":20,"width":18,"height":18},
		{"x":46,"y":39,"width":18,"height":18},
		{"x":46,"y":58,"width":18,"height":18},
		{"x":58,"y":77,"width":18,"height":18},
		{"x":69,"y":96,"width":16,"height":16},
		{"x":65,"y":1,"width":16,"height":16},
		{"x":65,"y":18,"width":16,"height":16},
		{"x":1,"y":110,"width":16,"height":16},
		{"x":18,"y":110,"width":16,"height":16},
		{"x":35,"y":110,"width":16,"height":16},
		{"x":52,"y":110,"width":16,"height":16},
		{"x":39,"y":91,"width":18,"height":18},
		{"x":1,"y":1,"width":44,"height":44},
		{"x":1,"y":46,"width":44,"height":44}
	]
};

for (var i = 0; i < objects_atlas.sprites.length; i++)
{
	objects_atlas.sprites[i].uv = [
		{
			x: objects_atlas.sprites[i].x / objects_atlas.width,
			y: objects_atlas.sprites[i].y / objects_atlas.height
		},
		{
			x: (objects_atlas.sprites[i].x + objects_atlas.sprites[i].width) / objects_atlas.width,
			y: (objects_atlas.sprites[i].y + objects_atlas.sprites[i].height) / objects_atlas.height
		}
	];
}

function Renderer(gfx, map, root, on_ready)
{
	root = root.toLowerCase();

	this.draw = draw;
	this.config = set_config;
	this.screenshot = screenshot;

	var vbo = null;
	var ibo = null;
	var objects_vbo = null;
	var objects_ibo = null;
	var batches = {};
	var active_batches = [];
	var active_objects = map.spawnpoints;
	var textures = [];
	var black_texture = null;
	var collider_texture = null;
	var objects_texture = null;

	var config = {
		background: true,
		scenery_back: true,
		scenery_middle: true,
		scenery_front: true,
		polygons: true,
		texture: true,
		wireframe: false,
		colliders: false,
		highlight: false,
		highlight_list: [],
		objects: false,
		objects_list: objects_atlas.sprites.map(function(x,i){return i;})
	};

	function Batch(mode, ibo_index, vbo_index)
	{
		this.mode = mode;
		this.ibo_index = ibo_index;
		this.vbo_index = vbo_index;
		this.calls = [];
	}

	function DrawCall(offset, count, texture)
	{
		this.offset = offset;
		this.count = count;
		this.texture = texture;
	}

	Batch.prototype.draw = function()
	{
		var calls = this.calls;
		var mode = this.mode;
		var base = this.ibo_index;

		for (var i = 0, n = calls.length; i < n; i++)
		{
			var call = calls[i];
			gfx.bind(textures[call.texture + 4]); // "+ x" -> amount unshifted after loading textures
			gfx.draw(mode, vbo, ibo, base + call.offset, call.count);
		}
	}

	function load_textures(on_done)
	{
		black_texture = gfx.create_texture(1, 1, gfx.RGBA, function(x, y, rgba) {
			rgba[0] = rgba[1] = rgba[2] = 0.5;
			rgba[3] = 1;
		});

		collider_texture = gfx.create_texture(256, 256, gfx.RGBA, function(x, y, rgba) {
			var inner = 1;
			var outer = 0.5;
			var dx = x - 128;
			var dy = y - 128;
			var dist = Math.sqrt(dx * dx + dy * dy);
			var color = inner + (outer - inner) * (dist / 128);
			var t = Math.max(Math.min((dist - 127) / (128 - 127), 1), 0);
			var alpha = 1 - t * t * (3 - 2 * t);

			rgba[0] = 1;
			rgba[1] = 1;
			rgba[2] = 1;
			rgba[3] = color * alpha;
		});

		collider_texture.generate_mipmap();
		collider_texture.filter(gfx.LinearMipmapLinear, gfx.Linear);

		for (var i = 0; i < map.images.length + 1; i++)
			textures.push(null);

		function image_path(path) {
			var ext = ["png", "jpg", "gif", "bmp"];
			var parts = path.toLowerCase().split(".");
			parts.pop();
			path = parts.join(".");

			for (var i = 0; i < ext.length; i++) {
				var filepath = filelist.find(function(filepath) {
					return filepath.toLowerCase() === (root + "/" + path + "." + ext[i]);
				});

				if (filepath)
					return "data/" + filepath;
			}

			return null;
		}

		textures[0] = image_path("textures/" + map.texture);

		for (var i = 0, n = map.objects.length; i < n; i++)
			textures[map.objects[i].style] = image_path("scenery-gfx/" + map.images[map.objects[i].style - 1]);

		var total = 1;
		var loaded = 0;

		function load(index)
		{
			var image = new Image();

			image.onload = function() {
				textures[index] = create_texture(image, index === 0);
				textures[index].src = image.src;
				++loaded === total && on_done();
			};

			image.onerror = function() {
				textures[index] = gfx.White;
				++loaded === total && on_done();
			};

			image.src = textures[index];
		}

		for (var i = 0; i < textures.length; i++)
			textures[i] !== null && total++;

		for (var i = 0; i < textures.length; i++)
			textures[i] !== null && load(i);

		var objects_image = new Image();

		objects_image.onload = function() {
			objects_texture = gfx.create_texture(objects_image);
			++loaded === total && on_done();
		};

		objects_image.src = "data/objects/objects.png";
	}

	function next_pot(x)
	{
		var result = 1;

		while (result < x)
			result = result << 1;

		return result;
	}

	function create_texture(image, pot)
	{
		var canvas = document.createElement("canvas");
		var context = canvas.getContext("2d");

		var w = image.width;
		var h = image.height;

		if (pot)
		{
			w = next_pot(w);
			h = next_pot(h);
		}

		canvas.width = w;
		canvas.height = h;

		context.drawImage(image, 0, 0, w, h);

		var imagedata = context.getImageData(0, 0, w, h);
		var data = imagedata.data;

		for (var y = 0, i = 0; y < h; y++)
		{
			for (var x = 0; x < w; x++, i += 4)
			{
				if (data[i] === 0 && data[i + 1] === 255 && data[i + 2] === 0)
				{
					data[i + 1] = 0;
					data[i + 3] = 0;
				}
			}
		}

		context.putImageData(imagedata, 0, 0);

		return gfx.create_texture(canvas);
	}

	function get_edges()
	{
		var polys = map.polygons;
		var list = [];
		var filtered = [];

		for (var i = 0, n = polys.length; i < n; i++)
		{
			list.push(
				[polys[i].vertices[0], polys[i].vertices[1]],
				[polys[i].vertices[1], polys[i].vertices[2]],
				[polys[i].vertices[2], polys[i].vertices[0]]
			);
		}

		list.reverse();

		function is_vert_equal(a, b)
		{
			return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
		}

		function is_edge_equal(a, b)
		{
			return is_vert_equal(a[0], b[0]) && is_vert_equal(a[1], b[1]) ||
				is_vert_equal(a[0], b[1]) && is_vert_equal(a[1], b[0]);
		}

		list.forEach(function(edge) {
			if (!filtered.some(is_edge_equal.bind(null, edge)))
				filtered.push(edge);
		});

		filtered.reverse();

		return filtered;
	}

	function create_background_batch(idx)
	{
		var batch = new Batch(gfx.Triangles, idx.ibo, idx.vbo);
		var d = map.sector_division;
		var n = map.num_sectors;

		batch.calls.push(new DrawCall(idx.ibo, 6, -1));

		ibo.set(idx.ibo++, idx.vbo + 0);
		ibo.set(idx.ibo++, idx.vbo + 1);
		ibo.set(idx.ibo++, idx.vbo + 2);

		ibo.set(idx.ibo++, idx.vbo + 2);
		ibo.set(idx.ibo++, idx.vbo + 3);
		ibo.set(idx.ibo++, idx.vbo + 0);

		vbo.set(idx.vbo++, -n * d,  n * d, 0, 0, map.bg_color_top);
		vbo.set(idx.vbo++,  n * d,  n * d, 0, 0, map.bg_color_top);
		vbo.set(idx.vbo++,  n * d, -n * d, 0, 0, map.bg_color_bottom);
		vbo.set(idx.vbo++, -n * d, -n * d, 0, 0, map.bg_color_bottom);

		return batch;
	}

	function setup_matrix(m, object)
	{
		var x = object.x;
		var y = -object.y;
		var c = Math.cos(object.rotation);
		var s = Math.sin(object.rotation);
		var sx = object.scalex;
		var sy = object.scaley;

		m[0] = c * sx; m[3] = -s * sy; m[6] = x;
		m[1] = s * sx; m[4] =  c * sy; m[7] = y;
		m[2] =      0; m[5] =       0; m[8] = 1;

		return m;
	}

	function create_scenery_batch(scenery, idx)
	{
		var batch = new Batch(gfx.Triangles, idx.ibo, idx.vbo);

		if (scenery.length === 0)
			return batch;

		var call = new DrawCall(0, 0, scenery[0].style);
		var matrix = mat3();

		for (var i = 0, n = scenery.length; i < n; i++)
		{
			if (scenery[i].style !== call.texture)
			{
				batch.calls.push(call);
				call = new DrawCall(call.offset + call.count, 0, scenery[i].style);
			}

			var m = setup_matrix(matrix, scenery[i]);
			var w = scenery[i].width;
			var h = scenery[i].height;
			var color = scenery[i].color;

			ibo.set(idx.ibo++, idx.vbo + 0);
			ibo.set(idx.ibo++, idx.vbo + 1);
			ibo.set(idx.ibo++, idx.vbo + 2);

			ibo.set(idx.ibo++, idx.vbo + 2);
			ibo.set(idx.ibo++, idx.vbo + 3);
			ibo.set(idx.ibo++, idx.vbo + 0);

			vbo.set(idx.vbo++, mat3mulx(m, 0,  0), mat3muly(m, 0,  0), 0, 0, color);
			vbo.set(idx.vbo++, mat3mulx(m, w,  0), mat3muly(m, w,  0), 1, 0, color);
			vbo.set(idx.vbo++, mat3mulx(m, w, -h), mat3muly(m, w, -h), 1, 1, color);
			vbo.set(idx.vbo++, mat3mulx(m, 0, -h), mat3muly(m, 0, -h), 0, 1, color);

			call.count += 6;
		}

		batch.calls.push(call);
		return batch;
	}

	function init()
	{
		var scenery_back = map.objects.filter(function(obj) { return obj.level === 0; });
		var scenery_middle = map.objects.filter(function(obj) { return obj.level === 1; });
		var scenery_front = map.objects.filter(function(obj) { return obj.level === 2; });
		var polygons = map.polygons;
		var highlight = map.polygons;
		var edges = get_edges();
		var colliders = map.colliders;

		// calculate total buffer sizes and create them

		var vbo_size =
			4 +
			4 * scenery_back.length +
			4 * scenery_middle.length +
			4 * scenery_front.length +
			3 * polygons.length +
			3 * highlight.length +
			2 * edges.length +
			4 * colliders.length;

		var ibo_size =
			6 +
			6 * scenery_back.length +
			6 * scenery_middle.length +
			6 * scenery_front.length +
			3 * polygons.length +
			3 * highlight.length +
			2 * edges.length +
			6 * colliders.length;

		vbo = gfx.create_vbo(vbo_size, gfx.Static);
		ibo = gfx.create_ibo(ibo_size, gfx.Static);

		vbo.size = vbo_size;
		ibo.size = ibo_size;

		// create batches

		var idx = {vbo: 0, ibo: 0};

		batches.background = create_background_batch(idx);
		batches.scenery_back = create_scenery_batch(scenery_back, idx);
		batches.scenery_middle = create_scenery_batch(scenery_middle, idx);
		batches.scenery_front = create_scenery_batch(scenery_front, idx);

		// polygons batch

		batches.polygons = new Batch(gfx.Triangles, idx.ibo, idx.vbo);
		batches.polygons.calls.push(new DrawCall(0, 3 * polygons.length, 0));

		for (var i = 0, n = polygons.length; i < n; i++)
		{
			var triangle = polygons[i];

			ibo.set(idx.ibo++, idx.vbo + 0);
			ibo.set(idx.ibo++, idx.vbo + 1);
			ibo.set(idx.ibo++, idx.vbo + 2);

			for (var j = 0; j < 3; j++)
			{
				var vertex = triangle.vertices[j];
				vbo.set(idx.vbo++, vertex.x, -vertex.y, vertex.u, vertex.v, vertex.color);
			}
		}

		// highlight batch

		var hl_color = [255, 255, 0, 128];

		batches.highlight = new Batch(gfx.Triangles, idx.ibo, idx.vbo);
		batches.highlight.calls.push(new DrawCall(0, 0, -1));

		for (var i = 0, n = polygons.length; i < n; i++)
		{
			var triangle = polygons[i];

			ibo.set(idx.ibo++, idx.vbo + 0);
			ibo.set(idx.ibo++, idx.vbo + 1);
			ibo.set(idx.ibo++, idx.vbo + 2);

			for (var j = 0; j < 3; j++)
			{
				var vertex = triangle.vertices[j];
				vbo.set(idx.vbo++, vertex.x, -vertex.y, 0, 0, hl_color);
			}
		}

		// edges batch

		var colors = [
			[0, 0, 0, 255],
			[0, 0, 0, 255]
		];

		batches.wireframe = new Batch(gfx.Lines, idx.ibo, idx.vbo);
		batches.wireframe.calls.push(new DrawCall(0, 2 * edges.length, -1));

		for (var i = 0, n = edges.length; i < n; i++)
		{
			var edge = edges[i];

			colors[0][0] = edge[0].color[0];
			colors[0][1] = edge[0].color[1];
			colors[0][2] = edge[0].color[2];

			colors[1][0] = edge[1].color[0];
			colors[1][1] = edge[1].color[1];
			colors[1][2] = edge[1].color[2];

			ibo.set(idx.ibo++, idx.vbo + 0);
			ibo.set(idx.ibo++, idx.vbo + 1);
			vbo.set(idx.vbo++, edge[0].x, -edge[0].y, edge[0].u, edge[0].v, colors[0]);
			vbo.set(idx.vbo++, edge[1].x, -edge[1].y, edge[1].u, edge[1].v, colors[1]);
		}

		// colliders batch

		var color = [255, 0, 0, 255];

		batches.colliders = new Batch(gfx.Triangles, idx.ibo, idx.vbo);
		batches.colliders.calls.push(new DrawCall(0, 6 * colliders.length, -3));

		for (var i = 0, n = colliders.length; i < n; i++)
		{
			var collider = colliders[i];
			var x = collider.x;
			var y = -collider.y;
			var r = collider.radius / 2.0;

			ibo.set(idx.ibo++, idx.vbo + 0);
			ibo.set(idx.ibo++, idx.vbo + 1);
			ibo.set(idx.ibo++, idx.vbo + 2);
			ibo.set(idx.ibo++, idx.vbo + 2);
			ibo.set(idx.ibo++, idx.vbo + 3);
			ibo.set(idx.ibo++, idx.vbo + 0);

			vbo.set(idx.vbo++, x - r, y - r, 0, 0, color);
			vbo.set(idx.vbo++, x + r, y - r, 1, 0, color);
			vbo.set(idx.vbo++, x + r, y + r, 1, 1, color);
			vbo.set(idx.vbo++, x - r, y + r, 0, 1, color);
		}

		// create separate buffer for objects

		objects_vbo = gfx.create_vbo(4 * map.spawnpoints.length, gfx.Stream);
		objects_ibo = gfx.create_ibo(6 * map.spawnpoints.length, gfx.Stream);

		for (var i = 0, n = 4 * map.spawnpoints.length; i < n; i += 4)
			objects_ibo.push(i, i + 1, i + 2, i + 2, i + 3, i);

		// upload data

		vbo.upload();
		ibo.upload();
		objects_ibo.upload();

		// set active batches

		update_active_batches();
	}

	function update_active_batches()
	{
		active_batches = [];

		config.background     && active_batches.push(batches.background);
		config.scenery_back   && active_batches.push(batches.scenery_back);
		config.scenery_middle && active_batches.push(batches.scenery_middle);
		config.polygons       && active_batches.push(batches.polygons);
		config.highlight      && active_batches.push(batches.highlight);
		config.scenery_front  && active_batches.push(batches.scenery_front);
		config.colliders      && active_batches.push(batches.colliders);
		config.wireframe      && active_batches.push(batches.wireframe);
	}

	function update_highlight_batch()
	{
		var types = config.highlight_list;
		var polygons = map.polygons;

		var poly_indices = polygons.map(function(p, i) { return i; }).filter(function(i) {
			return types.indexOf(polygons[i].type) !== -1;
		});

		batches.highlight.calls[0].count = 3 * poly_indices.length;

		var ibo_index = batches.highlight.ibo_index;
		var vbo_base = batches.highlight.vbo_index;

		for (var i = 0, n = poly_indices.length; i < n; i++)
		{
			var vbo_index = vbo_base + 3 * poly_indices[i];

			ibo.set(ibo_index++, vbo_index + 0);
			ibo.set(ibo_index++, vbo_index + 1);
			ibo.set(ibo_index++, vbo_index + 2);
		}

		ibo.upload(batches.highlight.ibo_index, 3 * poly_indices.length);
	}

	function set_config(name, value)
	{
		if (arguments.length === 0)
			return config;

		config[name] = value;

		if (name in batches)
		{
			update_active_batches();
		}
		else if (name === "texture")
		{
			batches.polygons.calls[0].texture = value ? 0 : -1;
			batches.wireframe.calls[0].texture = value ? -1 : -2;
		}
		else if (name === "highlight_list")
		{
			update_highlight_batch();
		}
		else if (name === "objects_list")
		{
			active_objects = map.spawnpoints.filter(function(s) { return value.indexOf(s.team) !== -1; });
		}
	}

	function draw(x, y, s)
	{
		var m = mat3();

		m[0] = s; m[3] = 0; m[6] = x * s;
		m[1] = 0; m[4] = s; m[7] = y * s;
		m[2] = 0; m[5] = 0; m[8] = 1;

		gfx.transform(m);

		for (var i = 0, n = active_batches.length; i < n; i++)
			active_batches[i].draw();

		if (config.objects && active_objects.length > 0)
		{
			objects_vbo.clear();

			var white = [255, 255, 255, 255];

			for (var i = 0, n = active_objects.length; i < n; i++)
			{
				var object = active_objects[i];
				var sprite = objects_atlas.sprites[object.team];
				var w = sprite.width;
				var h = sprite.height;
				var uv = sprite.uv;
				var x = Math.floor(mat3mulx(m, object.x, -object.y) - 0.5 * w);
				var y = Math.floor(mat3muly(m, object.x, -object.y) - 0.5 * h);

				objects_vbo.push(    x,     y, uv[0].x, uv[1].y, white);
				objects_vbo.push(x + w,     y, uv[1].x, uv[1].y, white);
				objects_vbo.push(x + w, y + h, uv[1].x, uv[0].y, white);
				objects_vbo.push(    x, y + h, uv[0].x, uv[0].y, white);
			}

			objects_vbo.upload();

			gfx.transform(mat3identity(m));
			gfx.bind(objects_texture);
			gfx.draw(gfx.Triangles, objects_vbo, objects_ibo, 0, 6 * n);
		}
	}

	function screenshot(ratio)
	{
		var v = [].concat.apply([], map.polygons.map(function(p) { return p.vertices; }));
		var x = v.map(function(v) { return v.x; });
		var y = v.map(function(v) { return v.y; });
		var margin = 10;

		var xmin = Math.floor(Math.min.apply(null, x)) - margin;
		var xmax = Math.ceil(Math.max.apply(null, x)) + margin;
		var ymin = Math.floor(Math.min.apply(null, y)) - margin;
		var ymax = Math.ceil(Math.max.apply(null, y)) + margin;

		var w = Math.abs(xmax - xmin);
		var h = Math.abs(ymax - ymin);

		var old_w = gfx.canvas.width;
		var old_h = gfx.canvas.height;

		gfx.canvas.width = Math.floor(w * ratio);
		gfx.canvas.height = Math.floor(h * ratio);

		w = gfx.canvas.width / ratio;
		h = gfx.canvas.height / ratio;

		gfx.viewport(0, 0, gfx.canvas.width, gfx.canvas.height);
		gfx.projection(mat3ortho(0, w, 0, h, mat3()));
		gfx.blend(gfx.SrcAlpha, gfx.OneMinusSrcAlpha, gfx.SrcAlpha, gfx.OneMinusSrcAlpha);
		gfx.clear_color(0, 0, 0, 1);
		gfx.clear();

		draw(w / 2, h / 2, 1);

		var url = gfx.canvas.toBlob(function(blob) {
			var url = URL.createObjectURL(blob);
			var link = document.createElement("a");
			
			link.setAttribute("href", url);
			link.setAttribute("download", map.id + ".png");
			
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}, "image/png");

		gfx.canvas.width = old_w;
		gfx.canvas.height = old_h;
	}

	// initialize

	load_textures(function() {
		textures[0].wrap(gfx.Repeat, gfx.Repeat);
		objects_texture.filter(gfx.Nearest, gfx.Nearest);
		textures.unshift(objects_texture, collider_texture, black_texture, gfx.White);
		init();
		on_ready();
	});
}

}(this));
