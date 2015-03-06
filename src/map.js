(function(exports) {

exports.Map = Map;

// data structures

function rgba(r, g, b, a)
{
	return [r, g, b, a];
}

function bgra(b, g, r, a)
{
	return [r, g, b, a];
}

function vec3(x, y, z)
{
	return new Vec3(x, y, z);
}

function Vec3(x, y, z)
{
	this.x = x;
	this.y = y;
	this.z = z;
}

function Vertex()
{
	this.x = 0;
	this.y = 0;
	this.z = 0;
	this.rhw = 0;
	this.color = rgba(0, 0, 0, 0);
	this.u = 0;
	this.v = 0;
}

function Polygon()
{
	this.vertices = [];
	this.normals = [];
	this.type = 0;
}

function MapObject()
{
	this.active = true;
	this.style = 0;
	this.width = 0;
	this.height = 0;
	this.x = 0;
	this.y = 0;
	this.rotation = 0;
	this.scalex = 0;
	this.scaley = 0;
	this.color = rgba(0, 0, 0, 0);
	this.level = 0;
}

function Collider()
{
	this.active = true;
	this.x = 0;
	this.y = 0;
	this.radius = 0;
}

function SpawnPoint()
{
	this.active = true;
	this.x = 0;
	this.y = 0;
	this.team = 0;
}

function WayPoint()
{
	this.active = true;
	this.id = 0;
	this.x = 0;
	this.y = 0;
	this.left = false;
	this.right = false;
	this.up = false;
	this.down = false;
	this.jet = false;
	this.path = 0;
	this.action = 0;
	this.c2 = 0;
	this.c3 = 0;
	this.cconnections = [];
}

function Map()
{
	this.version = 0;
	this.name = "";
	this.texture = "";
	this.bg_color_top = rgba(0, 0, 0, 0);
	this.bg_color_bottom = rgba(0, 0, 0, 0);
	this.jet_amount = 0;
	this.grenades = 0;
	this.medikits = 0;
	this.weather = 0;
	this.steps = 0;
	this.rand_id = 0;
	this.polygons = [];
	this.sector_division = 0;
	this.num_sectors = 0;
	this.sectors = [];
	this.objects = [];
	this.images = [];
	this.colliders = [];
	this.spawnpoints = [];
	this.waypoints = [];
}

Map.parse = parse;

// parsing functions

function Reader(buffer)
{
	this.offset = 0;
	this.view = new DataView(buffer);

	function read(func, size)
	{
		var value = size > 1 ? func.call(this.view, this.offset, true) : func.call(this.view, this.offset);
		this.offset += size;
		return value;
	}

	function read_string(max)
	{
		var len = this.u8();
		var values = [];

		for (var i = 0; i < len; i++)
			values.push(this.u8());

		this.skip(max - len);
		return String.fromCharCode.apply(null, values);
	}

	function skip(amount)
	{
		this.offset += amount;
	}

	this.i8 = read.bind(this, DataView.prototype.getInt8, 1);
	this.u8 = read.bind(this, DataView.prototype.getUint8, 1);
	this.i16 = read.bind(this, DataView.prototype.getInt16, 2);
	this.u16 = read.bind(this, DataView.prototype.getUint16, 2);
	this.i32 = read.bind(this, DataView.prototype.getInt32, 4);
	this.u32 = read.bind(this, DataView.prototype.getUint32, 4);
	this.f32 = read.bind(this, DataView.prototype.getFloat32, 4);
	this.str = read_string.bind(this);
	this.skip = skip.bind(this);
}

function parse(buffer)
{
	var reader = new Reader(buffer);
	var data = new Map();

	read_header(reader, data);
	read_polygons(reader, data);
	read_sectors(reader, data);
	read_objects(reader, data);
	read_images(reader, data);
	read_colliders(reader, data);
	read_spawnpoints(reader, data);
	read_waypoints(reader, data);

	return data;
}

function read_header(r, data)
{
	data.version = r.i32();
	data.name = r.str(38);
	data.texture = r.str(24);
	data.bg_color_top = bgra(r.u8(), r.u8(), r.u8(), r.u8());
	data.bg_color_bottom = bgra(r.u8(), r.u8(), r.u8(), r.u8());
	data.jet_amount = r.i32();
	data.grenades = r.u8();
	data.medikits = r.u8();
	data.weather = r.u8();
	data.steps = r.u8();
	data.rand_id = r.i32();
}

function read_polygons(r, data)
{
	var count = r.i32();

	for (var i = 0; i < count; i++)
		data.polygons.push(read_polygon(r));
}

function read_polygon(r)
{
	var polygon = new Polygon();

	polygon.vertices.push(read_vertex(r));
	polygon.vertices.push(read_vertex(r));
	polygon.vertices.push(read_vertex(r));

	polygon.normals.push(vec3(r.f32(), r.f32(), r.f32()));
	polygon.normals.push(vec3(r.f32(), r.f32(), r.f32()));
	polygon.normals.push(vec3(r.f32(), r.f32(), r.f32()));

	polygon.type = r.u8();

	return polygon;
}

function read_vertex(r)
{
	var vertex = new Vertex();

	vertex.x = r.f32();
	vertex.y = r.f32();
	vertex.z = r.f32();
	vertex.rhw = r.f32();
	vertex.color = bgra(r.u8(), r.u8(), r.u8(), r.u8());
	vertex.u = r.f32();
	vertex.v = r.f32();

	return vertex;
}

function read_sectors(r, data)
{
	data.sector_division = r.i32();
	data.num_sectors = r.i32();

	var count = (2 * data.num_sectors + 1) * (2 * data.num_sectors + 1);

	for (var i = 0; i < count; i++)
	{
		var sector = [];
		var poly_count = r.u16();

		for (var j = 0; j < poly_count; j++)
			sector.push(r.u16());

		data.sectors.push(sector);
	}
}

function read_objects(r, data)
{
	var count = r.i32();

	for (var i = 0; i < count; i++)
		data.objects.push(read_object(r));
}

function read_object(r)
{
	var object = new MapObject();

	object.active = r.u8() !== 0;
	r.skip(1);

	object.style = r.u16();
	object.width = r.i32();
	object.height = r.i32();
	object.x = r.f32();
	object.y = r.f32();
	object.rotation = r.f32();
	object.scalex = r.f32();
	object.scaley = r.f32();

	var alpha = r.u8();
	r.skip(3);

	object.color = bgra(r.u8(), r.u8(), r.u8(), r.u8());
	object.color[3] = alpha;
	object.level = r.u8();
	r.skip(3);

	return object;
}

function read_images(r, data)
{
	var count = r.i32();

	for (var i = 0; i < count; i++)
	{
		data.images.push(r.str(50));
		r.skip(4);
	}
}

function read_colliders(r, data)
{
	var count = r.i32();

	for (var i = 0; i < count; i++)
		data.colliders.push(read_collider(r));
}

function read_collider(r)
{
	var collider = new Collider();

	collider.active = r.u8() !== 0;
	r.skip(3);

	collider.x = r.f32();
	collider.y = r.f32();
	collider.radius = r.f32();

	return collider;
}

function read_spawnpoints(r, data)
{
	var count = r.i32();

	for (var i = 0; i < count; i++)
		data.spawnpoints.push(read_spawnpoint(r));
}

function read_spawnpoint(r)
{
	var spawnpoint = new SpawnPoint();

	spawnpoint.active = r.u8() !== 0;
	r.skip(3);

	spawnpoint.x = r.i32();
	spawnpoint.y = r.i32();
	spawnpoint.team = r.u32();

	return spawnpoint;
}

function read_waypoints(r, data)
{
	var count = r.i32();

	for (var i = 0; i < count; i++)
		data.waypoints.push(read_waypoint(r));
}

function read_waypoint(r)
{
	var waypoint = new WayPoint();

	waypoint.active = r.u8() !== 0;
	r.skip(3);

	waypoint.id = r.i32();
	waypoint.x = r.i32();
	waypoint.y = r.i32();
	waypoint.left = r.u8() !== 0;
	waypoint.right = r.u8() !== 0;
	waypoint.up = r.u8() !== 0;
	waypoint.down = r.u8() !== 0;
	waypoint.jet = r.u8() !== 0;
	waypoint.path = r.u8();
	waypoint.action = r.u8();
	waypoint.c2 = r.u8();
	waypoint.c3 = r.u8();
	r.skip(3);

	var count = r.i32();

	for (var i = 0; i < count; i++)
		waypoint.cconnections.push(r.i32());

	r.skip(4 * (20 - count));

	return waypoint;
}

}(this));
