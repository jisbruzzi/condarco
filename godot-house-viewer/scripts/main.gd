extends Node3D

## Visor de la casa modelada en assets/floorplan.obj.
##
## El OBJ viene del pipeline en metros con Z como eje vertical (Z-up):
##   X = este, Y = norte/sur (planta), Z = altura.
## Godot usa Y como eje vertical, asi que rotamos el modelo -90 grados en X
## para que la altura quede en Y y la casa se vea en pie.

const OBJ_PATH := "res://assets/floorplan.obj"

@onready var _house: MeshInstance3D = $House
@onready var _player: Node3D = $Player
@onready var _coords: Label = $HUD/Coords

func _ready() -> void:
	# Direccion de la luz solar (angulada para que se lean los volumenes).
	$Sun.rotation = Vector3(deg_to_rad(-55.0), deg_to_rad(40.0), 0.0)

	# La malla ya viene asignada desde la escena; si por lo que sea no cargo
	# (p.ej. el .obj todavia no fue importado), la generamos con el parser.
	if _house.mesh == null:
		_house.mesh = _load_house_mesh()
	_house.material_override = _make_material()
	_house.rotation = Vector3(deg_to_rad(-90.0), 0.0, 0.0)

func _process(_delta: float) -> void:
	var p := _player.global_position
	_coords.text = "X: %8.3f m\nY: %8.3f m\nZ: %8.3f m" % [p.x, p.y, p.z]

func _load_house_mesh() -> Mesh:
	# Camino normal: Godot importa el .obj como recurso Mesh.
	var imported: Resource = load(OBJ_PATH)
	if imported is Mesh:
		return imported
	# Respaldo: parser interno del Wavefront OBJ.
	push_warning("Usando parser OBJ interno para " + OBJ_PATH)
	return _parse_obj(OBJ_PATH)

func _make_material() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.84, 0.81, 0.75)
	mat.roughness = 0.9
	# Sin descarte de caras: asi se ven tambien las paredes desde dentro.
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat

func _parse_obj(path: String) -> ArrayMesh:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("No se pudo abrir " + path)
		return null

	var verts := PackedVector3Array()
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	while not file.eof_reached():
		var line := file.get_line().strip_edges()
		if line.is_empty() or line.begins_with("#"):
			continue
		var parts := line.split(" ", false)
		match parts[0]:
			"v":
				verts.append(Vector3(parts[1].to_float(), parts[2].to_float(), parts[3].to_float()))
			"f":
				var idx := []
				for i in range(1, parts.size()):
					var raw := parts[i].split("/")[0]
					var n := raw.to_int()
					idx.append(n - 1 if n > 0 else verts.size() + n)
				# Triangulacion en abanico (las caras del modelo son cuadrilateros).
				for i in range(1, idx.size() - 1):
					st.add_vertex(verts[idx[0]])
					st.add_vertex(verts[idx[i]])
					st.add_vertex(verts[idx[i + 1]])

	st.generate_normals()
	return st.commit()
