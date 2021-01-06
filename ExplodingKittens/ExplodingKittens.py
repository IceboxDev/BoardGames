import engine
import pygame

Game = engine.Game("img/bg/bg.jpg", fullscreen=False)
Game.load_cards("img/exploding_kittens/JPEG")

Game.create_deck("Draw", lambda tag: tag not in ("explosion", 

                                                 
                                                 ))
running = True
while running:

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

Game.quit()
