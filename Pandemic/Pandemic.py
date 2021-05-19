from scipy.sparse.csgraph import connected_components
from scipy.sparse import csr_matrix

from json import load, dumps
import numpy as np

import spritesheet
import engine
import pygame

Game = engine.Game("img/bg/bg.jpg", fullscreen=True)
GameSpritesheet = spritesheet.Spritesheet("img/game_spritesheet.png")
game_sprites = GameSpritesheet.images_datafile("sprites.json")
NameSpritesheet = spritesheet.Spritesheet("img/names_spritesheet.png")
name_sprites = NameSpritesheet.images_datafile("city_names.json")

city_sprites = []
names = []
for city in load(open("cities.json", "r")):
    names.append(city["sprite_id"])
    sprite_id = city["sprite_id"]
    x, y = city["position"]
    a = pygame.transform.scale(game_sprites[city["sprite_icon"]], (50, 50))
    b = pygame.transform.scale(name_sprites[city["sprite_id"]], (150, 24))
    image = pygame.Surface((150, 74), pygame.SRCALPHA)
    image.blit(a, (50, 0))
    image.blit(b, (0, 40))
    city_sprites.append(engine.GameSprite(sprite_id, x, y, image))
Game.add_background_group(pygame.sprite.Group(tuple(city_sprites)))


running = True
while running:
    Game.step()
    for city_a, city_b in load(open("connections.json", "r")):
        pygame.draw.line(Game.screen, (0,0,0),
                         city_sprites[names.index(city_a)].rect.topleft,
                         city_sprites[names.index(city_b)].rect.topleft)
        print(city_sprites[names.index(city_a)].rect.topleft, city_sprites[names.index(city_a)].rect.topleft)
    pygame.display.update()
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

Game.quit()
