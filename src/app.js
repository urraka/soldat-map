var canvas = document.querySelector("canvas");
var gfx = gfx_create_context(canvas, {alpha: true});
var map = null;
var renderer = null;
var dx = 0;
var dy = 0;
var scale = 1;
var mouse = {x: window.innerWidth/2, y: window.innerHeight/2};
var filelist =

http_get("data/filelist", "text", function(data) {
	filelist = data
		.split(/\r?\n/)
		.filter(function(line) { return line !== ""; });

	var maplist = filelist
		.filter(function(path) {
			return path.split(".").pop() === "pms";
		})
		.map(function(path) {
			var parts = path.split("/");
			return parts[0] + "/" + parts.pop().slice(0, -4);
		});

	var fuzzy = new FuzzySearch(maplist);

	$("#search").autocomplete({
		appendTo: $("#search-container"),
		minLength: 0,
		source: function(req, response) {
			response(fuzzy.find(req.term));
		},
		select: function() {
			setTimeout(function() {
				window.location.hash = $("#search").val();
			}, 0);
		}
	}).keydown(function(e){ e.stopPropagation(); }).focus();

	if (window.location.hash.length > 1) {
		load_map(window.location.hash.substr(1));
	}
	else {
		var version = filelist
			.map(function(path) {
				return path.split("/").shift();
			})
			.filter(function(val, idx, self) {
				return self.indexOf(val) === idx
			})
			.sort()
			.pop();

		var random_list = maplist.filter(function(name) {
			return name.startsWith(version);
		});

		var random_index = Math.floor(Math.random() * random_list.length);

		load_map(random_list[random_index]);
	}

	window.addEventListener("hashchange", function() {
		load_map(window.location.hash.substr(1));
	});

	window.addEventListener("resize", draw);
	canvas.addEventListener("mousedown", mousedown);
	window.addEventListener("mousemove", mousemove);
	window.addEventListener("keydown", keydown);
	canvas.addEventListener("wheel", wheel);
	canvas.addEventListener("dblclick", dblclick);
	document.querySelector(".view-options").addEventListener("mousedown", on_view_options_mousedown);
	document.querySelector(".view-options").addEventListener("change", on_view_options_change);
	document.querySelector("#screenshot-scale").addEventListener("change", on_screenshot_scale_change);
	document.querySelector("#screenshot").addEventListener("click", on_screenshot);
});

function any_checked(selector)
{
	var inputs = document.querySelectorAll(selector);
	return [].slice.call(inputs).some(function(input) { return input.checked; });
}

function on_screenshot_scale_change()
{
	var input = document.querySelector("#screenshot-scale");
	var scale = parseFloat(input.value);

	if (isNaN(scale) || !isFinite(scale) || scale <= 0) {
		scale = 1;
	}

	var val = scale.toString() + "x";

	if (val !== input.value) {
		input.value = scale.toString() + "x";
	}
}

function on_screenshot()
{
	if (renderer) {
		var input = document.querySelector("#screenshot-scale");
		var scale = parseFloat(input.value);

		if (isNaN(scale) || !isFinite(scale) || scale <= 0) {
			scale = 1;
		}

		renderer.screenshot(scale);
		draw();
	}
}

function on_view_options_mousedown(event)
{
	$("#search").blur();
	event.preventDefault();
	event.stopPropagation();
}

function on_view_options_change(event)
{
	if (renderer)
	{
		var name = event.target.id.split("-").pop();

		if (name.lastIndexOf("highlight_", 0) === 0)
		{
			if (event.target.checked)
			{
				document.querySelector("#cfg-highlight").checked = true;
				renderer.config("highlight", true);
			}
			else if (document.querySelectorAll("#cfg-highlight-options input:checked").length === 0)
			{
				document.querySelector("#cfg-highlight").checked = false;
				renderer.config("highlight", false);
			}

			var inputs = document.querySelectorAll("#cfg-highlight-options input:checked");

			var value = [].slice.call(inputs).map(function(input) {
				return parseInt(input.id.split("_").pop());
			});

			renderer.config("highlight_list", value);
		}
		else if (name.lastIndexOf("objects_", 0) === 0)
		{
			if (event.target.checked)
			{
				document.querySelector("#cfg-objects").checked = true;
				renderer.config("objects", true);
			}
			else if (document.querySelectorAll("#cfg-objects-options input:checked").length === 0)
			{
				document.querySelector("#cfg-objects").checked = false;
				renderer.config("objects", false);
			}

			var inputs = document.querySelectorAll("#cfg-objects-options input:checked");

			var value = [].slice.call(inputs).map(function(input) {
				return parseInt(input.id.split("_").pop());
			});

			renderer.config("objects_list", value);
		}
		else if (name.lastIndexOf("scenery", 0) === 0)
		{
			var scenery = document.querySelector("#cfg-scenery");

			if (name !== "scenery")
			{
				if (event.target.checked)
					scenery.checked = true;
				else if (document.querySelectorAll("#cfg-scenery-options input:checked").length === 0)
					scenery.checked = false;
			}

			if (scenery.checked)
			{
				renderer.config("scenery_back", document.querySelector("#cfg-scenery_back").checked);
				renderer.config("scenery_middle", document.querySelector("#cfg-scenery_middle").checked);
				renderer.config("scenery_front", document.querySelector("#cfg-scenery_front").checked);
			}
			else
			{
				renderer.config("scenery_back", false);
				renderer.config("scenery_middle", false);
				renderer.config("scenery_front", false);
			}
		}
		else
		{
			renderer.config(name, event.target.checked);
		}

		draw();
	}
}

function load_map(name)
{
	document.body.classList.add("loading");
	document.body.classList.remove("loaderror");

	var parts = name.split("/");

	if (parts.length === 1)
		parts.unshift("171");

	if (window.location.hash.substr(1) !== parts[0] + "/" + parts[1]) {
		window.location.hash = parts[0] + "/" + parts[1];
		return;
	}

	http_get("data/" + parts[0] + "/maps/" + parts[1] + ".pms", "arraybuffer",
		on_load.bind(null, window.location.hash.substr(1).replace(/\//g, "_"), parts[0]));
}

function on_load(id, root, buffer)
{
	dx = 0;
	dy = 0;
	scale = 1;

	var config = renderer ? renderer.config() : {};

	if (!buffer)
	{
		document.body.classList.remove("loading");
		document.body.classList.add("loaderror");
		document.title = "Soldat Map Viewer";
		$("#search").focus();
		return;
	}

	map = Map.parse(buffer);
	map.id = id;

	renderer = new MapRenderer(gfx, map, root, function() {
		document.body.classList.remove("loading");
		document.title = map.name + " - Soldat Map Viewer";
		$("#search").focus();

		var v = [].concat.apply([], map.polygons.map(function(p) { return p.vertices; }));
		var x = v.map(function(v) { return v.x; });
		var y = v.map(function(v) { return v.y; });

		var xmin = Math.min.apply(null, x);
		var xmax = Math.max.apply(null, x);
		var ymin = Math.min.apply(null, y);
		var ymax = Math.max.apply(null, y);

		var wopt = document.querySelector(".view-options").offsetWidth;
		var W = window.innerWidth - wopt;

		scale = 0.9 * Math.min(W / (xmax - xmin), window.innerHeight / (ymax - ymin));
		dx = xmin + (xmax - xmin) * 0.5 - 0.5 * wopt / scale;
		dy = ymin + (ymax - ymin) * 0.5;

		for (var name in config)
			renderer.config(name, config[name]);

		draw();
	});
}

function mousemove(event)
{
	mouse.x = event.clientX;
	mouse.y = event.clientY;
}

function dblclick(event)
{
	event.preventDefault();
	(scale = 1) && draw();
}

function wheel(event)
{
	var prev_scale = scale;
	var offsetx =  (mouse.x - window.innerWidth / 2);
	var offsety = -(mouse.y - window.innerHeight / 2);

	event.deltaY < 0 ? (scale *= 1.25) : (scale /= 1.25);

	dx += offsetx / scale - offsetx / prev_scale;
	dy += offsety / scale - offsety / prev_scale;

	draw();
}

function keydown(event)
{
	var prev_scale = scale;

	event.keyCode === 107 && (scale *= 1.25);
	event.keyCode === 109 && (scale /= 1.25);

	if (prev_scale !== scale)
	{
		var offsetx =  (mouse.x - window.innerWidth / 2);
		var offsety = -(mouse.y - window.innerHeight / 2);

		dx += offsetx / scale - offsetx / prev_scale;
		dy += offsety / scale - offsety / prev_scale;

		draw();
	}
}

function mousedown(event)
{
	$("#search").blur();
	$("#screenshot-scale").blur();
	event.preventDefault();

	var x = event.clientX;
	var y = event.clientY;

	function mousemove(event)
	{
		var offsetx = (event.clientX - x);
		var offsety = (y - event.clientY);

		x = event.clientX;
		y = event.clientY;

		dx += offsetx / scale;
		dy += offsety / scale;

		requestAnimationFrame(draw);
	}

	function mouseup()
	{
		window.removeEventListener("mouseup", mouseup);
		window.removeEventListener("mousemove", mousemove);
	}

	window.addEventListener("mouseup", mouseup);
	window.addEventListener("mousemove", mousemove);
}

function draw()
{
	if (!renderer)
		return;

	var w = canvas.width = canvas.offsetWidth;
	var h = canvas.height = canvas.offsetHeight;

	gfx.viewport(0, 0, w, h);
	gfx.projection(mat3ortho(0, w, 0, h, mat3()));
	gfx.blend(gfx.One, gfx.OneMinusSrcAlpha, gfx.One, gfx.OneMinusSrcAlpha);
	gfx.clear_color(0, 0, 0, 0);
	gfx.clear();

	renderer.draw(1/scale * w/2 + dx, 1/scale * h/2 + dy, scale);
}

function http_get(url, type, callback)
{
	var request = new XMLHttpRequest();
	request.open("GET", url);
	request.responseType = type;

	request.addEventListener("loadend", function() {
		callback(request.status === 200 ? request.response : null);
	});

	request.send();
}
