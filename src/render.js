(function(exports) {

exports.MapRenderer = Renderer;

function Renderer(gfx, map, on_ready)
{
	this.draw = draw;

	var vbo = null;
	var ibo = null;
	var batches = {};
	var active_batches = [];
	var textures = [];

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
			gfx.bind(textures[call.texture + 1]);
			gfx.draw(mode, vbo, ibo, base + call.offset, call.count);
		}
	}

	function load_textures(on_done)
	{
		for (var i = 0; i < map.images.length + 1; i++)
			textures.push(null);

		textures[0] = "data/textures/" + map.texture;

		for (var i = 0, n = map.objects.length; i < n; i++)
			textures[map.objects[i].style] = "data/scenery-gfx/" + map.images[map.objects[i].style - 1];

		var total = 0;
		var loaded = 0;

		function load(index)
		{
			var image = new Image();

			image.onload = function() {
				textures[index] = create_texture(image, index === 0);
				++loaded === total && on_done();
			};

			image.onerror = function() {
				textures[index] = gfx.White;
				++loaded === total && on_done();
			};

			image.src = textures[index].toLowerCase();
		}

		for (var i = 0; i < textures.length; i++)
			textures[i] !== null && total++;

		for (var i = 0; i < textures.length; i++)
			textures[i] !== null && load(i);
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
		if (image.src.split(".").pop().toLowerCase() === "png")
			return gfx.create_texture(image);

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

		// calculate total buffer sizes and create them

		var vbo_size =
			4 +
			4 * scenery_back.length +
			4 * scenery_middle.length +
			4 * scenery_front.length +
			3 * polygons.length +
			3 * highlight.length +
			2 * edges.length;

		var ibo_size =
			6 +
			6 * scenery_back.length +
			6 * scenery_middle.length +
			6 * scenery_front.length +
			3 * polygons.length +
			3 * highlight.length +
			2 * edges.length;

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

		var hl_color = [255, 0, 0, 128];

		batches.highlight = new Batch(gfx.Triangles, idx.ibo, idx.vbo);
		batches.highlight.calls.push(new DrawCall(0, 3 * polygons.length, -1));

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

		// upload data

		vbo.upload();
		ibo.upload();

		// set active batches

		active_batches.push(
			batches.background,
			batches.scenery_back,
			batches.scenery_middle,
			batches.polygons,
			batches.scenery_front
		);
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
	}

	// initialize

	load_textures(function() {
		textures[0].wrap(gfx.Repeat, gfx.Repeat);
		textures.unshift(gfx.White);
		init();
		on_ready();
	});
}

}(this));
