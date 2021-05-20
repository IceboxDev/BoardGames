from engine import Color

# Files -----------------------------------------------------------------------|
# ↪ Images
BACKGROUND: str = "img/bg/bg.jpg"
GAME_SPRITESHEET: str = "img/game_spritesheet.png"
NAME_SPRITESHEET: str = "img/names_spritesheet.png"

# ↪ Datafiles
SPRITES_DATAFILE: str = "sprites.json"
CITIES_DATAFILE: str = "city_names.json"
CITY_POS_DATAFILE: str = "cities.json"
CONNECTIONS_DATAFILE: str = "connections.json"


# Literals --------------------------------------------------------------------|
# ↪ Keys
SPRITE_ICON: str = "sprite_icon"
SPRITE_ID: str = "sprite_id"
POSITION: str = "position"
CONNECTION: str = "connection"
CONNECTION_LOOP: str = "loop"


# Parameters ------------------------------------------------------------------|
# ↪ Graphics
CITYSPACE_SIZE: int = 50
CITYTEXT_WIDTH: int = 150
CITYTEXT_HEIGHT: int = 24
CITYTEXT_UPSHIFT: int = 10
LINE_WIDTH: int = 3

# Colors ----------------------------------------------------------------------|
# ↪ Graphics
LINE_COLOR: Color = Color(160, 255, 255)