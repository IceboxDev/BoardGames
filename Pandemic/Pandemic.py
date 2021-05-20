from scipy.sparse.csgraph import connected_components
from scipy.sparse import csr_matrix

from json import load, dumps
import numpy as np

from constants import *
import spritesheet
import engine
import pygame

Game = engine.Game(BACKGROUND, fullscreen=False)
GameSpritesheet = spritesheet.Spritesheet(GAME_SPRITESHEET)
game_sprites = GameSpritesheet.images_datafile(SPRITES_DATAFILE)
NameSpritesheet = spritesheet.Spritesheet(NAME_SPRITESHEET)
name_sprites = NameSpritesheet.images_datafile(CITIES_DATAFILE)

city_sprites = []
names = []
for city in load(open(CITY_POS_DATAFILE, "r")):
    names.append(city[SPRITE_ID])
    sprite_id = city[SPRITE_ID]
    x, y = city[POSITION]
    cityspace_c = engine.Point(x + CITYTEXT_WIDTH // 2, y + CITYSPACE_SIZE // 2)
    cityspace_size = (CITYSPACE_SIZE, CITYSPACE_SIZE)
    citytext_size = (CITYTEXT_WIDTH, CITYTEXT_HEIGHT)
    a = pygame.transform.scale(game_sprites[city[SPRITE_ICON]], cityspace_size)
    b = pygame.transform.scale(name_sprites[city[SPRITE_ID]], citytext_size)
    s = (CITYTEXT_WIDTH, CITYSPACE_SIZE + CITYTEXT_HEIGHT - CITYTEXT_UPSHIFT)
    image = pygame.Surface(s, pygame.SRCALPHA)
    image.blit(a, ((CITYTEXT_WIDTH - CITYSPACE_SIZE) // 2, 0))
    image.blit(b, (0, CITYSPACE_SIZE - CITYTEXT_UPSHIFT))
    city_sprites.append(engine.GameSprite(
        sprite_id, engine.Point(x, y), image, cityspace_center=cityspace_c))
Game.add_sprite_group(pygame.sprite.Group(tuple(city_sprites)), 0)

line_sprites =[]
for city in load(open(CONNECTIONS_DATAFILE, "r")):
    city_a, city_b = city[CONNECTION]
    point_a = city_sprites[names.index(city_a)].cityspace_center
    point_b = city_sprites[names.index(city_b)].cityspace_center
    city_id = city_a + city_b

    line_sprites.append(Game.generate_line_sprite(
        city_id, LINE_COLOR, point_a, point_b, LINE_WIDTH,
        flip_left=city[CONNECTION_LOOP]))

    if city[CONNECTION_LOOP]:
        city_id = city_b + city_a
        line_sprites.append(Game.generate_line_sprite(
            city_id, LINE_COLOR, point_b, point_a, LINE_WIDTH,
            flip_right=city[CONNECTION_LOOP]))

Game.add_sprite_group(pygame.sprite.Group(tuple(line_sprites)), 0)

running = True
while running:
    Game.step()

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

