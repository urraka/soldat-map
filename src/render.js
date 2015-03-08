(function(exports) {

exports.MapRenderer = Renderer;

function Renderer(gfx, map, on_ready)
{
	this.draw = draw;

	var vbo = null;
	var ibo = null;
	var draw_calls = [];
	var textures = [];

	load_textures(function() {
		textures[0].wrap(gfx.Repeat, gfx.Repeat);
		init_buffers();
		on_ready();
	});

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
				textures[index] = create_texture(image);
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

	function create_texture(image)
	{
		if (image.src.split(".").pop().toLowerCase() === "png")
			return gfx.create_texture(image);

		var canvas = document.createElement("canvas");
		var context = canvas.getContext("2d");
		var w = canvas.width = image.width;
		var h = canvas.height = image.height;

		context.drawImage(image, 0, 0);

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

	function init_buffers()
	{
		var vertex_count = 0;
		var index_count = 0;

		// background quad
		vertex_count += 4;
		index_count += 6;

		// terrain triangles
		vertex_count += 3 * map.polygons.length;
		index_count += 3 * map.polygons.length;

		// objects
		vertex_count += 4 * map.objects.length;
		index_count += 6 * map.objects.length;

		vbo = gfx.create_vbo(vertex_count, gfx.Static);
		ibo = gfx.create_ibo(index_count, gfx.Static);

		var m = mat3();
		var draw_offset = 0;
		var draw_count = 0;
		var texture = -1;
		var idx = 0;

		function check_texture_switch(tex)
		{
			if (tex !== texture)
			{
				if (draw_count > 0)
				{
					draw_calls.push(draw_offset, draw_count, texture);
					draw_offset += draw_count;
					draw_count = 0;
				}

				texture = tex;
			}
		}

		function add_objects(objects)
		{
			var n = objects.length;

			for (var i = 0; i < n; i++)
			{
				check_texture_switch(objects[i].style);

				// add vertices

				m = setup_matrix(m, objects[i]);

				var w = objects[i].width;
				var h = objects[i].height;
				var color = objects[i].color;

				vbo.push(mat3mulx(m, 0,  0), mat3muly(m, 0,  0), 0, 0, color);
				vbo.push(mat3mulx(m, w,  0), mat3muly(m, w,  0), 1, 0, color);
				vbo.push(mat3mulx(m, w, -h), mat3muly(m, w, -h), 1, 1, color);
				vbo.push(mat3mulx(m, 0, -h), mat3muly(m, 0, -h), 0, 1, color);

				ibo.push(idx + 0, idx + 1, idx + 2);
				ibo.push(idx + 2, idx + 3, idx + 0);

				idx += 4;
				draw_count += 6;
			}

			check_texture_switch(-1);
		}

		// background

		var d = map.sector_division;
		var n = map.num_sectors;

		vbo.push(-n * d,  n * d, 0, 0, map.bg_color_top);
		vbo.push( n * d,  n * d, 0, 0, map.bg_color_top);
		vbo.push( n * d, -n * d, 0, 0, map.bg_color_bottom);
		vbo.push(-n * d, -n * d, 0, 0, map.bg_color_bottom);

		ibo.push(0, 1, 2);
		ibo.push(2, 3, 0);

		draw_calls.push(draw_offset, 6, -1);
		draw_offset += 6;

		idx = 4;

		// objects on the back
		add_objects(map.objects.filter(function(obj) { return obj.level !== 2; }));

		// terrain

		for (var i = 0, n = map.polygons.length; i < n; i++)
		{
			var poly = map.polygons[i];

			for (var j = 0; j < 3; j++)
			{
				var vertex = poly.vertices[j];
				vbo.push(vertex.x, -vertex.y, vertex.u, vertex.v, vertex.color);
			}

			ibo.push(idx + 0, idx + 1, idx + 2);
			idx += 3;
		}

		draw_calls.push(draw_offset, 3 * map.polygons.length, 0);
		draw_offset += 3 * map.polygons.length;

		// objects on the front
		add_objects(map.objects.filter(function(obj) { return obj.level === 2; }));

		vbo.upload();
		ibo.upload();
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

	function draw(x, y, s)
	{
		var m = mat3();

		m[0] = s; m[3] = 0; m[6] = x * s;
		m[1] = 0; m[4] = s; m[7] = y * s;
		m[2] = 0; m[5] = 0; m[8] = 1;

		gfx.transform(m);

		for (var i = 0, n = draw_calls.length; i < n; i += 3)
		{
			var offset = draw_calls[i];
			var count = draw_calls[i + 1];
			var texture = draw_calls[i + 2];

			gfx.bind(texture === -1 ? gfx.White : textures[texture]);
			gfx.draw(gfx.Triangles, vbo, ibo, offset, count);
		}
	}
}

}(this));
