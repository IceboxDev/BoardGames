import pygame

class Game:

    def __init__(self, fullscreen=True) -> None:
        self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
