extends CharacterBody3D

## Control en primera persona tipo "camara libre":
##   WASD  -> moverse en el plano horizontal
##   Espacio / Shift -> subir / bajar
##   Raton -> mirar
##   Esc   -> liberar el raton (click para volver a capturarlo)

@export var move_speed := 4.0
@export var mouse_sensitivity := 0.0025

var _yaw := 0.0
var _pitch := 0.0
var _captured := false

func _ready() -> void:
	_yaw = rotation.y
	_pitch = rotation.x
	_capture_mouse(true)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and _captured:
		_yaw -= event.relative.x * mouse_sensitivity
		_pitch = clampf(_pitch - event.relative.y * mouse_sensitivity,
				deg_to_rad(-89.0), deg_to_rad(89.0))
		rotation = Vector3(_pitch, _yaw, 0.0)
	elif event.is_action_pressed("toggle_mouse"):
		_capture_mouse(not _captured)
	elif event is InputEventMouseButton and event.pressed and not _captured:
		_capture_mouse(true)

func _physics_process(_delta: float) -> void:
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := (transform.basis * Vector3(input.x, 0.0, input.y)).normalized()

	var vertical := 0.0
	if Input.is_action_pressed("move_up"):
		vertical += 1.0
	if Input.is_action_pressed("move_down"):
		vertical -= 1.0

	var velocity_target := direction + Vector3.UP * vertical
	if velocity_target.length() > 0.0:
		velocity_target = velocity_target.normalized() * move_speed
	velocity = velocity_target
	move_and_slide()

func _capture_mouse(capture: bool) -> void:
	_captured = capture
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if capture else Input.MOUSE_MODE_VISIBLE
